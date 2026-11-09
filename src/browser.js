const puppeteer = require('puppeteer');

/**
 * Shared Puppeteer lifecycle. Subclasses decide headless mode.
 */
class BrowserBase {
    constructor(url, debug, locale, headless) {
        this.url = url;
        this.locale = locale;
        this.debug = debug;
        this.headless = headless;
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: this.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        );
        // Minimal anti-bot hardening: hide the webdriver flag.
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
    }

    async stop() {
        if (this.browser) await this.browser.close();
        this.browser = null;
        this.page = null;
    }
}

module.exports = BrowserBase;
