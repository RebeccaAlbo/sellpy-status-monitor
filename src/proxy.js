require('dotenv').config();

/**
 * Proxy resolver interface.
 *
 * Returns a proxy URL like "http://user:pass@host:port" or null for direct.
 *
 * Today: single proxy from PROXY_URL in .env.
 * Swap the body for a rotating-proxy provider later — watcher.js won't change.
 */
function getProxy() {
    return process.env.PROXY_URL || null;
}

module.exports = { getProxy };
