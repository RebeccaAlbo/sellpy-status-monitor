/**
 * Sellpy Inventory Watcher
 * * A specialized web automation tool built with Puppeteer to monitor 
 * high-demand e-commerce items that are currently "Reserved" in another user's cart.
 * It alerts the user the moment the item becomes "Available" again.
 */

const puppeteer = require('puppeteer');
const readline = require('readline');
const notifier = require('node-notifier');
require('dotenv').config();
const nodemailer = require('nodemailer');

// toggle for development
const config = {
    debug: true,
    enableEmailAlert: true,
    enableNoticiation: true,
    enableAutoCart: false // "Experimental: Turn on to automate purchase"
};

// Initialize Readline interface for terminal-based user interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout 
});

/**
 * Utility: Standard delay function using Promises
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scraper Logic: Extracts current item state from the DOM
 * Uses a robust waitForFunction to handle dynamic React/Vue content hydration.
 * * @param {Object} page - Puppeteer page instance
 * @param {string} url - Target product URL
 * @returns {string} - Item status: SOLD, RESERVED, AVAILABLE, or TIMEOUT
 */
const checkItemStatus = async (page, url) => {
    try {
        // Load page and wait for the initial DOM to be parsed
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Executes logic within the browser context to identify item state
        const status = await page.waitForFunction(() => {
            // Check for 'Sold' indicator
            const sold = document.querySelector('div[data-testid="blob"]');
            if (sold && sold.innerText.includes('Såld')) return 'SOLD';

            // Check for 'Reserved' timer icon (item is in someone's cart)
            const reserved = document.querySelector('i[data-testid="icon-CART_TIME"]');
            if (reserved) return 'RESERVED';

            // Check for 'Add to cart' button (item is free to buy)
            const available = Array.from(document.querySelectorAll('span'))
                                   .find(el => el.innerText.includes('Lägg i varukorg'));
            if (available) return 'AVAILABLE';

            return null; // Function retries until a state is found or timeout occurs
        }, { timeout: 5000 }).then(handle => handle.jsonValue()).catch(() => 'TIMEOUT');
        
        return status;

    } catch (error) {
        console.error('\n❌ Scraper Error:', error.message);
        return 'ERROR';
    }
};

/**
 * Orchestrator: Manages the User Interface and Monitoring Loop
 */
const ask = (query) => new Promise(resolve => rl.question(query, resolve));

const startUI = async () => {
    console.log(`
=========================================
       SELLPY INVENTORY WATCHER
=========================================
This tool monitors "Reserved" items and alerts
you the moment they become available.
-----------------------------------------
    `);

    // Step 1: Get the URL
    let urlInput = await ask('🔗 Paste the Sellpy item URL: ');
    let url = urlInput.trim();

    if (!url.includes('sellpy')) {
        console.log('❌ Error: Please enter a valid Sellpy URL.');
        rl.close();
        return startUI();
    }

    // Step 2: Ask if they want desktop notifications
    let wantsNote = await ask('🔔 Would you like to receive a desktop notification? (y/n): ');
    config.enableNotification = wantsNote.toLowerCase() === 'y';

    if (config.enableNotification) {
        notifier.notify({
            title: 'Alerts are on',
            message: 'You will be notified!',
            sound: true, 
            wait: true   
        });
    }

    // Step 3: Ask if they want email notifications
    let wantsEmail = await ask('📧 Would you like to receive an email alert? (y/n): ');
    config.enableEmailAlert = wantsEmail.toLowerCase() === 'y';
    
    let recipientEmail = null;
    if (config.enableEmailAlert) {
        recipientEmail = await ask('📬 Enter the recipient email address: ');
        recipientEmail = recipientEmail.trim();
    }

    console.log(`\n🚀 Starting monitor...`);
    console.log(`📡 Target: ${url}`);
    if (config.enableEmailAlert) console.log(`📩 Alerts will be sent to: ${recipientEmail}`);
    console.log('-----------------------------------------\n');

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    console.log('⏳ Checking initial status...');
    let status = await checkItemStatus(page, url);
    updateUI(status);

        // Configuration for the monitoring loop
        const sleepTimer = 15000; // 15s delay to prevent IP rate-limiting/shadow-banning
    const continueOn = 'RESERVED';

        // Entering the "Watch" phase if the item is currently reserved
    if (status === continueOn) {
        console.log(`Item is reserved. Starting watcher (Polling every ${sleepTimer/1000}s)...`);
        
        while (true) {
            status = await checkItemStatus(page, url);
            if (config.debug) console.log(`[${new Date().toLocaleTimeString()}] Status: ${status}`);

            if (status === continueOn) {
                await sleep(sleepTimer);
                continue; 
            }

            if (status === 'AVAILABLE') {
                // Trigger OS Desktop Notification
                if (config.enableNotification) {
                    notifier.notify({
                        title: 'Sellpy Alert!',
                        message: 'THE ITEM IS AVAILABLE! Grab it now!',
                        sound: true, 
                        wait: true   
                    });
                }

                // Conditional Email Notification
                if (config.enableEmailAlert && recipientEmail) {
                    await sendEmailAlert(url, recipientEmail); 
                }

                if (config.enableAutoCart) {
                    await addToCart(page);
                }
                break; 
            }
            
            // Handle other statuses (SOLD, ERROR, TIMEOUT)
            if (status === 'SOLD') {
                console.log('❌ Item is sold. Monitoring stopped.');
                break;
            } else if (status === 'ERROR' || status === 'TIMEOUT') {
                console.log('⚠️ Connection error. Retrying...');
                await sleep(sleepTimer);
                continue;
            }
            break; // Exit loop if item is SOLD or AVAILABLE
        }
        updateUI(status);
    }

    // Cleanup resources
    rl.close();
    await browser.close();
};

/**
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
        subject: '🛒 ITEM AVAILABLE: Grab it now!',
        html: `<b>The item you were watching is now available!</b><br><br><a href="${itemUrl}">Click here to buy it now</a>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('📧 Email alert sent successfully!');
    } catch (error) {
        console.error('❌ Failed to send email:', error.message);
    }
};

const addToCart = async () => {

}

/**
 * View Layer: Handles terminal output formatting
 * @param {string} status - The status key to display
 */
const updateUI = (status) => {
    const messages = {
        'SOLD':      'Status: 🔴 SOLD (This item is gone!)',
        'RESERVED':  'Status: 🟡 RESERVED (In someone\'s cart right now)',
        'AVAILABLE': 'Status: 🟢 AVAILABLE (Grab it while it\'s hot!)',
        'TIMEOUT':   'Status: ⚠️ NOT FOUND (Could not detect page elements)',
        'ERROR':     'Status: ❌ ERROR (Connection failed)'
    };
    console.log(messages[status] || 'Status: Unknown');
};

startUI();
