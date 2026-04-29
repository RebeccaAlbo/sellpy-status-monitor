/*
 * Sellpy Inventory Watcher
 * * A specialized web automation tool built with Puppeteer to monitor 
 * high-demand e-commerce items that are currently "Reserved" in another user's cart.
 * It alerts the user the moment the item becomes "Available" again.
 */


const readline = require('readline');
const notifier = require('node-notifier');
require('dotenv').config();
const nodemailer = require('nodemailer');
const SellpyWatcher = require('./watcher.js');
const SellpyBuyer = require('./buyer.js');
const { LOCALES, POLLING_INTERVAL } = require('./constants');

// toggle for development
const config = {
    debug: process.argv.includes('--debug') || process.argv.includes('-d'),
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
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


/*
 * Main Controller: Orchestrates the CLI flow and the Watcher Engine
 */
const startUI = async () => {
    // 1. Splash Screen
    console.log(`
    =========================================
           SELLPY INVENTORY WATCHER
    =========================================
    `);

    // 2. Gather User Inputs (The "View" layer)
    const url = await getValidatedURL();
    const match = url.match(/sellpy\.(se|de|at|com)/);
    const tld = match ? match[1] : 'com'; // Default to English
    const locale = LOCALES[tld] || LOCALES['com'];   

    config.enableNotify = (await ask('Enable desktop notifications? (y/n): ')).toLowerCase() === 'y';
    if (config.enableNotify) {
        notifier.notify({
            title: 'Alerts are on',
            message: 'You will be notified!',
            sound: true, 
            wait: true   
        });
    }

    config.enableEmail = (await ask('Enable email alerts? (y/n): ')).toLowerCase() === 'y';
    
    let emailAddress = null;
    if (config.enableEmail) {
        emailAddress = await getValidatedEmail();
    }

    // 3. Initialize the Engine
    const watcher = new SellpyWatcher(
        url,
        config.debug,
        locale
    );

    console.log(`\n Starting monitor...`);
    console.log(`Target: ${url}`);
    console.log('-----------------------------------------\n');
    await watcher.init();

    try {
        let status = await watcher.checkStatus();
        if (status === 'RESERVED') updateUI(status);

        // 4. The Monitoring Loop
        while (status === 'RESERVED' || status === 'TIMEOUT' || status === 'ERROR') {
            await sleep(POLLING_INTERVAL);
            
            try {
                status = await watcher.checkStatus();
            } catch (loopError) {
                console.error('⚠️ Connection interrupted. Re-initializing...');
                status = 'ERROR';
                // Try to restart the browser if it fails completely
                await watcher.stop();
                await watcher.init();
            }
            
            if (config.debug) console.log(`[${new Date().toLocaleTimeString()}] Status: ${status}`);
        }
        updateUI(status); 
        if (status === 'AVAILABLE') {
            await handleSuccess(watcher, url, emailAddress, locale);
        }


    } catch (error) {
        console.error('\n🛑 Critical Runtime Error:', error.message);
    } finally {
        await watcher.stop();
        rl.close();
    }
};

/*
 * Helper: Logic for when an item is found
 */
const handleSuccess = async (watcher, url, email, locale) => {

    if (config.enableNotify) {
        notifier.notify({ title: 'Sellpy Alert!', message: 'Item is AVAILABLE!', sound: true });
    }

    if (config.enableEmail && email) {
        await sendEmailAlert(url, email);
    }

    if (config.enableAutoCart) {
        const buyer = new SellpyBuyer(
            url,
            config.debug,
            locale
        );
        await buyer.init();
        await buyer.autoAddToCart();

        console.log('Item added to cart! Browser stays open\nSwitch to the browser to checkout manually!.');
        while (true) {
            let wantsContinue = await ask('Type \'q\' to close when done. : ');
            let continueMonitoring = wantsContinue.toLowerCase().trim() === 'q';
            if (continueMonitoring) break;
            else console.log('not a valid command please try again.');
        }
        await buyer.stop();
    }
};

const getValidatedURL = async () => {
    if (config.debug) {
        const useTest = (await ask('Would you like to use the testing item link? (y/n): ')).toLowerCase() === 'y';
        if (useTest) {
            console.log(`[DEBUG] using test URL: "${process.env.TEST_LINK}"`);
            return process.env.TEST_LINK;
        }
    }

    while (true) {
        let input = await ask('Paste Sellpy URL: ');
        const sellpyRegex = /sellpy\.(se|de|at|com)\/item\/\w+/;
        
        if (sellpyRegex.test(input)) {
            return input.trim();
        }
        
        console.log('Invalid Sellpy link. Format: https://www.sellpy.se/item/ID');
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
 * Updated sendEmailAlert to accept a dynamic recipient
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
        to: recipientEmail, // Uses the email entered in the prompt
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

/*
 * View Layer: Handles terminal output formatting
 * @param {string} status - The status key to display
 */
const updateUI = (status) => {
    const messages = {
        'SOLD':      'Status: 🔴 SOLD (This item is gone!)',
        'RESERVED':  'Status: 🟡 RESERVED (In someone\'s cart right now) monitoring until it becomes available or sold...',
        'AVAILABLE': 'Status: 🟢 AVAILABLE (Grab it while it\'s hot!)',
        'TIMEOUT':   'Status: ⚠️ NOT FOUND (Could not detect page elements)',
        'ERROR':     'Status: ❌ ERROR (Connection failed)'
    };
    console.log(messages[status] || 'Status: Unknown');
};

startUI();
