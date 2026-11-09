const BrowserBase = require('./browser');
const { SELECTORS } = require('./constants');

/**
 * Core Watcher Engine
 * Encapsulates scraping logic. Headless unless debugging.
 */
class SellpyWatcher extends BrowserBase {
    constructor(url, debug, locale) {
        super(url, debug, locale, !debug);
    }

    async checkStatus(retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.page.goto(this.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 20000,
                });

                const handle = await this.page.waitForFunction(
                    (loc, sel) => {
                        const sold = document.querySelector(sel.SOLD_INDICATOR);
                        if (sold && sold.innerText.includes(loc.soldText)) return 'SOLD';

                        const icon = document.querySelector(sel.RESERVED_ICON);
                        const isReserved = icon
                            && icon.closest('div')?.textContent.includes(loc.reservedText);
                        if (isReserved) return 'RESERVED';

                        const available = Array.from(
                            document.querySelectorAll(sel.AVAILABLE_PARENT)
                        ).find(el => el.innerText.includes(loc.buyButton));
                        if (available) return 'AVAILABLE';

                        return null;
                    },
                    { timeout: 10000 },
                    this.locale,
                    SELECTORS
                );

                return await handle.jsonValue();
            } catch (e) {
                if (this.debug) console.log(`[Attempt ${i + 1}] Check failed: ${e.message}`);
                if (i === retries - 1) return 'TIMEOUT';
            }
        }
    }
}

module.exports = SellpyWatcher;
