/**
 * Sellpy Inventory Watcher
 * * A specialized web automation tool built with Puppeteer to monitor 
 * high-demand e-commerce items that are currently "Reserved" in another user's cart.
 * It alerts the user the moment the item becomes "Available" again.
 */

const puppeteer = require('puppeteer');
const readline = require('readline');
const notifier = require('node-notifier');


// toggle for development
const config = {
    debug: true,
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
const startUI = async () => {
    rl.question('Paste the Sellpy item URL: ', async (answer) => {
        const url = answer.trim();

        // Basic validation to ensure the scraper hits the correct domain
        if (!url.includes('sellpy')) {
            console.log('❌ Please enter a valid Sellpy URL.');
            return startUI(); 
        }
        
        console.log(`\nConnecting to Sellpy...`);
        const browser = await puppeteer.launch({ headless: "new" }); // Modern headless mode
        const page = await browser.newPage();
        
        console.log('Checking status, please wait...');
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
                if (console.debug) console.log(`[${new Date().toLocaleTimeString()}] Status: ${status}`);

                if (status === continueOn) {
                    await sleep(sleepTimer);
                    continue; 
                }

                if (status === 'AVAILABLE') {
                    // Trigger OS Desktop Notification
                    notifier.notify({
                        title: 'Sellpy Alert!',
                        message: 'THE ITEM IS AVAILABLE! Grab it now!',
                        sound: true, 
                        wait: true   
                    });
                    
                    // Trigger system beeps as an audible fail-safe
                    for(let i=0; i<3; i++) {
                        process.stdout.write('\u0007'); 
                        await sleep(150);
                    }
                }
                break; // Exit loop if item is SOLD or AVAILABLE
            }
            updateUI(status);
        }

        // Cleanup resources
        rl.close();
        await browser.close();
    });
};



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
