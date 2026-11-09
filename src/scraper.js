/*
 * Sellpy Inventory Watcher
 * * A specialized web automation tool built with Puppeteer to monitor
 * high-demand e-commerce items that are currently "Reserved" in another user's cart.
 * It alerts the user the moment the item becomes "Available" again.
 *
 * Batch mode: reads targets from targets.json, monitors them concurrently.
 */


const readline = require('readline');
const notifier = require('node-notifier');
require('dotenv').config();
const nodemailer = require('nodemailer');
const SellpyWatcher = require('./watcher.js');
const SellpyBuyer = require('./buyer.js');
const { logStatus } = require('./db');
const { LOCALES, SLOW_INTERVAL, FAST_INTERVAL } = require('./constants');
const { loadTargets } = require('./targets.js');

// toggle for development
const config = {
    debug: process.argv.includes('--debug') || process.argv.includes('-d'),
    POLLING_INTERVAL: (process.argv.includes('--turbo')) ? FAST_INTERVAL : SLOW_INTERVAL,
    enableEmail: true,
    enableNotify: true,
    enableAutoCart: true, // "Experimental: Turn on to automate purchase"
};

// Initialize Readline interface for terminal-based user interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/*
 * Manages the User Interface and Monitoring Loop
 */
const ask = (query) => new Promise(resolve => rl.question(query, resolve));


/*
 * Utility: Standard delay function using Promises
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


/*
 * Per-run state.
 * - `alerted`: targets we've already fired alerts for (prevents double-firing).
 * - `autoCartUsed`: whether the one auto-cart slot has been consumed.
 *   Set *synchronously* in the loop, before any await, so two AVAILABLE
 *   targets in the same tick can't both launch a buyer.
 */
const alerted = new Set();
let autoCartUsed = false;


/*
 * Derive the locale object for a target URL.
 */
const resolveLocale = (url) => {
    const match = url.match(/sellpy\.(se|de|at|com)/);
    const tld = match ? match[1] : 'com';
    return LOCALES[tld] || LOCALES['com'];
};


/*
 * True while any target still needs polling.
 */
const isStillPending = (statusMap) =>
    [...statusMap.values()].some(
        s => s === 'RESERVED' || s === 'TIMEOUT' || s === 'ERROR' || s === 'UNKNOWN'
    );


/*
 * Compact per-target status line.
 */
const logStatuses = (targets, statusMap) => {
    for (const { url, label } of targets) {
        const name = label ?? url.split('/item/')[1] ?? url;
        const icon = {
            SOLD: '🔴 SOLD',
            RESERVED: '🟡 RESERVED',
            AVAILABLE: '🟢 AVAILABLE',
            TIMEOUT: '⚠️ TIMEOUT',
            ERROR: '❌ ERROR',
            UNKNOWN: '⚪ UNKNOWN',
        }[statusMap.get(url)] ?? '❔';
        console.log(`  ${name}: ${icon}`);
    }
    console.log('-----------------------------------------');
};


/*
 * Resolves when the given single character key is pressed on stdin.
 * Always restores raw mode, even if the surrounding code throws.
 */
const waitForKeypress = (expected) => new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (key) => {
        if (key === '\u0003') { // Ctrl-C
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            process.exit(0);
        }
        if (key.toLowerCase() === expected) {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            resolve();
        }
    };

    stdin.on('data', onData);
});


/*
 * Main Controller: Orchestrates the CLI flow and the Watcher Engine
 */
const startUI = async () => {
    // 1. Splash Screen
    console.log(`
    =========================================
           SELLPY INVENTORY WATCHER
         (batch mode — targets.json)
    =========================================
    `);

    // 2. Load targets
    let targets;
    try {
        targets = await loadTargets();
    } catch (e) {
        console.error(`🛑 ${e.message}`);
        rl.close();
        return;
    }

    // 3. Global alert settings (one prompt, applies to all targets)
    config.enableNotify = (await ask('Enable desktop notifications? (y/n): '))
        .toLowerCase() === 'y';

    if (config.enableNotify) {
        notifier.notify({
            title: 'Alerts are on',
            message: 'You will be notified!',
            sound: true,
            wait: true
        });
    }

    config.enableEmail = (await ask('Enable email alerts? (y/n): '))
        .toLowerCase() === 'y';

    const emailAddress = config.enableEmail ? await getValidatedEmail() : null;

    console.log(`\nMonitoring ${targets.length} target(s)...`);
    targets.forEach((t, i) =>
        console.log(`  [${i + 1}] ${t.label ?? '(unlabeled)'} → ${t.url}`)
    );
    console.log('-----------------------------------------\n');

    // 4. One watcher per target
    const watchers = targets.map(({ url }) => ({
        url,
        watcher: new SellpyWatcher(url, config.debug, resolveLocale(url)),
    }));

    for (const { watcher } of watchers) {
        await watcher.init();
    }

    // 5. Per-target status map
    const pending = new Map(watchers.map(({ url }) => [url, 'UNKNOWN']));

    try {
        // initial check for each (fault-isolated)
        await Promise.allSettled(watchers.map(async ({ url, watcher }) => {
            pending.set(url, await watcher.checkStatus());
        }));

        logStatuses(targets, pending);

        // 6. Monitoring loop — keep polling while *any* target is pending
        while (isStillPending(pending)) {
            await sleep(config.POLLING_INTERVAL);

            await Promise.allSettled(watchers.map(async ({ url, watcher }) => {
                const current = pending.get(url);
                if (current === 'SOLD' || current === 'AVAILABLE') return; // terminal

                try {
                    pending.set(url, await watcher.checkStatus());
                } catch (loopError) {
                    if (config.debug) console.log(`[${url}] loop error: ${loopError.message}`);
                    pending.set(url, 'ERROR');
                    // self-heal this watcher only
                    await watcher.stop();
                    await watcher.init();
                }
            }));

            logStatuses(targets, pending);

            // Fire alerts for any newly-AVAILABLE target.
            // `autoCartUsed` is set synchronously here (before any await)
            // so simultaneous AVAILABLEs can't race into two buyers.
            for (const { url } of watchers) {
                if (pending.get(url) !== 'AVAILABLE') continue;
                if (alerted.has(url)) continue;
                alerted.add(url);

                const wantBuyer = config.enableAutoCart && !autoCartUsed;
                if (wantBuyer) autoCartUsed = true;

                // Fire-and-forget: monitoring continues while the buyer is open.
                handleSuccess(url, emailAddress, resolveLocale(url), wantBuyer)
                    .catch(err => console.error(`handleSuccess failed for ${url}: ${err.message}`));
            }
        }

        console.log('\nAll targets resolved (SOLD or AVAILABLE). Stopping.\n');

    } catch (error) {
        console.error('\n🛑 Critical Runtime Error:', error.message);
    } finally {
        for (const { watcher } of watchers) {
            await watcher.stop();
        }
        rl.close();
    }
};


/*
 * Helper: Logic for when an item is found.
 * `wantBuyer` is decided by the caller so this function never races.
 */
const handleSuccess = async (url, email, locale, wantBuyer) => {
    const target = url.split('/item/')[1] ?? url;
    console.log(`\n🟢 AVAILABLE: ${target}\n${url}\n`);

    if (config.enableNotify) {
        notifier.notify({
            title: 'Sellpy Alert!',
            message: `Item is AVAILABLE: ${target}`,
            sound: true,
        });
    }

    if (config.enableEmail && email) {
        await sendEmailAlert(url, email);
    }

    if (!wantBuyer) {
        if (config.enableAutoCart) {
            console.log(`Auto-cart already used for another target; skipping buy for ${target}.`);
        }
        return;
    }

    const buyer = new SellpyBuyer(url, config.debug, locale);
    try {
        await buyer.init();
        await buyer.autoAddToCart();
        console.log(
            `Item added to cart! Browser stays open for ${target}.\n` +
            'Press "q" in this terminal when you are done to close it.'
        );
        await waitForKeypress('q');
    } catch (err) {
        console.error(`Buyer failed for ${target}: ${err.message}`);
    } finally {
        await buyer.stop();
    }
};


const getValidatedEmail = async () => {
    while (true) {
        const email = await ask('Enter recipient email: ');
        const trimmedEmail = email.trim();

        if (trimmedEmail.includes('@') && trimmedEmail.includes('.', trimmedEmail.indexOf('@'))) {
            return trimmedEmail;
        }

        console.log('Please enter a valid email address (e.g., name@example.com)');
    }
};


/*
 * Send email alert to a dynamic recipient.
 */
const sendEmailAlert = async (itemUrl, recipientEmail) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('⚠️ Email error: SMTP credentials missing in .env');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: `"Sellpy Watcher" <${process.env.EMAIL_USER}>`,
        to: recipientEmail,
        subject: 'ITEM AVAILABLE: Grab it now!',
        html: `<b>The item you were watching is now available!</b><br><br><a href="${itemUrl}">Click here to buy it now</a>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email alert sent successfully!');
    } catch (error) {
        console.error('❌ Failed to send email:', error.message);
    }
};


startUI();
