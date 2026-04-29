const puppeteer = require('puppeteer');
const { SELECTORS } = require('./constants');
/**
 * Manage clicking in the item to cart
 */
class SellpyBuyer {
    constructor(url, debug, locale) {
        this.url = url;
        this.locale = locale
        this.debug = debug;
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.browser = await puppeteer.launch({ 
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        this.page = await this.browser.newPage();
        // realistic user agent
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
    }

    async autoAddToCart() {
        // Open visible browser for checkout
        await this.page.goto(this.url);

        // Wait for the button to exist
        await this.page.waitForFunction((loc, sel) => {
            return Array.from(document.querySelectorAll(sel.AVAILABLE_PARENT))
                .some(el => el.innerText.includes(loc.buyButton));
        }, { timeout: 10000 }, this.locale, SELECTORS);

        // Click the button
        await this.page.evaluate((loc, sel) => {
            const span = Array.from(document.querySelectorAll(sel.AVAILABLE_PARENT))
                            .find(el => el.innerText.includes(loc.buyButton));
            
            if (span) {
                const btn = span.closest('button');
                if (btn) btn.click();
            }
        }, this.locale, SELECTORS);

    }

    async stop() {
        if (this.browser) await this.browser.close();
    }
}

module.exports = SellpyBuyer;