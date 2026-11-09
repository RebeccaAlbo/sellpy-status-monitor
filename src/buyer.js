const BrowserBase = require('./browser');
const { SELECTORS } = require('./constants');

/**
 * Manage adding the item to cart. Always visible so the user can check out.
 */
class SellpyBuyer extends BrowserBase {
    constructor(url, debug, locale) {
        super(url, debug, locale, /* headless */ false);
    }

    async autoAddToCart() {
        await this.page.goto(this.url);

        await this.page.waitForFunction(
            (loc, sel) => Array.from(document.querySelectorAll(sel.AVAILABLE_PARENT))
                .some(el => el.innerText.includes(loc.buyButton)),
            { timeout: 10000 },
            this.locale,
            SELECTORS
        );

        await this.page.evaluate(
            (loc, sel) => {
                const span = Array.from(document.querySelectorAll(sel.AVAILABLE_PARENT))
                    .find(el => el.innerText.includes(loc.buyButton));
                if (span) {
                    const btn = span.closest('button');
                    if (btn) btn.click();
                }
            },
            this.locale,
            SELECTORS
        );
    }
}

module.exports = SellpyBuyer;
