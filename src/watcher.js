const puppeteer = require('puppeteer');
const { SELECTORS } = require('./constants');

/**
 * Core Watcher Engine
 * Encapsulates scraping logic and browser management
 */
class SellpyWatcher {
    constructor(url, debug, locale) {
        this.url = url;
        this.locale = locale;
        this.debug = debug;
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.browser = await puppeteer.launch({ 
            headless: !this.debug,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        this.page = await this.browser.newPage();
        // realistic user agent
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
    }

    async checkStatus(retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const status = await this.page.waitForFunction((loc, sel) => {
                    const sold = document.querySelector(sel.SOLD_INDICATOR);
                    if (sold && (sold.innerText.includes(loc.soldText))) return 'SOLD';

                    const icon = document.querySelector(sel.RESERVED_ICON);
                    const isInCorrectDiv = icon && icon.closest('div')?.textContent.includes(loc.reservedText);
                    if (isInCorrectDiv) return 'RESERVED';

                    const available = Array.from(document.querySelectorAll(sel.AVAILABLE_PARENT))
                                        .find(el => el.innerText.includes(loc.buyButton));
                    if (available) return 'AVAILABLE';

                    return null;
                }, { timeout: 10000 }, this.locale, SELECTORS).then(h => h.jsonValue());

                return status;
            } catch (e) {
                if (this.debug) console.log(`[Attempt ${i + 1}] Check failed: ${e.message}`);
                if (i === retries - 1) return 'TIMEOUT'; // Out of retries
            }
        }
    }

    async stop() {
        if (this.browser) await this.browser.close();
    }
}

module.exports = SellpyWatcher;