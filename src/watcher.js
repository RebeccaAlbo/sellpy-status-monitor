const puppeteer = require('puppeteer');
const BrowserBase = require('./browser');
const { SELECTORS, BACKOFF } = require('./constants');
const { getProxy } = require('./proxy');

/**
 * Full-jitter exponential backoff.
 * @param {number} attempt  0-indexed attempt number
 * @param {number} baseMs   base delay
 * @param {number} maxMs    cap
 * @returns {number} milliseconds to sleep
 *
 * Full jitter (rand(0, base * 2^attempt)) is the AWS-recommended variant:
 * it spreads retries from many clients so the origin's queue drains,
 * instead of everyone retrying at the same synchronized instant.
 */
const backoffDelay = (attempt, baseMs, maxMs) => {
    const ceiling = Math.min(maxMs, baseMs * (2 ** attempt));
    return Math.floor(Math.random() * ceiling);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Core Watcher Engine
 * Encapsulates scraping logic. Headless unless debugging.
 */
class SellpyWatcher extends BrowserBase {
    constructor(url, debug, locale) {
        super(url, debug, locale, !debug);
    }

    async init() {
        const proxy = getProxy();
        const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];

        // Puppeteer's built-in `--proxy-server` only supports http(s) proxies
        // without credentials in the URL. For credentialed proxies, prefer
        // page.authenticate() below. We support both: env-only proxy string
        // (no auth) goes to launch; credentialed one gets authenticated.
        if (proxy) {
            const parsed = new URL(proxy);
            launchArgs.push(`--proxy-server=${parsed.protocol}//${parsed.host}`);
        }

        this.browser = await puppeteer.launch({
            headless: this.headless,
            args: launchArgs,
        });
        this.page = await this.browser.newPage();

        // Credentialed proxy auth (puppeteer can't take creds in launch args).
        if (proxy) {
            const parsed = new URL(proxy);
            if (parsed.username || parsed.password) {
                await this.page.authenticate({
                    username: decodeURIComponent(parsed.username),
                    password: decodeURIComponent(parsed.password),
                });
            }
        }

        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        );
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
    }

    /**
     * Classify a failure so we can decide whether to back off.
     * - `blocked`: 429 / 403 / captcha-ish redirect → back off hard
     * - `network`: timeouts / DNS / connection reset → back off mild
     * - `other`: everything else → back off mild
     */
    _classifyError(err) {
        const msg = (err && err.message) || '';
        if (/\b(429|403)\b/.test(msg)) return 'blocked';
        if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|Navigation timeout/i.test(msg)) return 'network';
        return 'other';
    }

    /**
     * Read the HTTP status of the current page response, if Puppeteer stored it.
     * (waitForFunction failures don't always surface this, so we double-check
     *  by hitting the response that `goto` resolved to.)
     */
    async _lastHttpStatus() {
        try {
            const resp = await this.page.waitForResponse(() => true, { timeout: 0 })
                .catch(() => null);
            return resp ? resp.status() : null;
        } catch {
            return null;
        }
    }

    /**
     * Run a single status check.
     * Throws on rate-limit/block so checkStatus's outer backoff can react.
     */
    async _checkOnce() {
        const response = await this.page.goto(this.url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000,
        });

        // Hard-block detection: if Sellpy 429s or 403s, don't waste 10s
        // waiting for a selector that will never appear.
        const status = response && response.status();
        if (status === 429 || status === 403) {
            const err = new Error(`HTTP ${status} from ${this.url}`);
            err.code = status === 429 ? 'RATE_LIMIT' : 'BLOCKED';
            throw err;
        }

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
    }

    /**
     * Public API: run the check with exponential backoff + jitter.
     * Returns one of: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'TIMEOUT'
     * (never throws — callers rely on that).
     */
    async checkStatus() {
        const { BASE_MS, MAX_MS, MAX_ATTEMPTS } = BACKOFF;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
                return await this._checkOnce();
            } catch (e) {
                const kind = this._classifyError(e);
                const isLast = attempt === MAX_ATTEMPTS - 1;

                if (this.debug) {
                    console.log(
                        `[attempt ${attempt + 1}/${MAX_ATTEMPTS}] ${kind}: ${e.message}` +
                        (isLast ? ' (giving up)' : '')
                    );
                }

                if (isLast) return 'TIMEOUT';

                const delay = backoffDelay(attempt, BASE_MS, MAX_MS);
                if (this.debug) console.log(`[backoff] sleeping ${delay}ms`);

                // A rate-limit/block means our current browser fingerprint
                // may already be burned. Stop the browser and let the next
                // checkStatus() call re-init (scraper.js already does this
                // on a thrown error — but we never throw, so nudge it via
                // a special path: return ERROR and let caller restart).
                if (kind === 'blocked') {
                    await this.stop();
                    return 'ERROR'; // caller re-inits on ERROR
                }

                await sleep(delay);
            }
        }
        return 'TIMEOUT';
    }
}

module.exports = SellpyWatcher;
