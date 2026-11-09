const fs = require('fs/promises');
const path = require('path');

const SELLPY_REGEX = /sellpy\.(se|de|at|com)\/item\/\w+/;
const CONFIG_PATH = path.resolve(process.cwd(), 'targets.json');

/**
 * Load and normalize targets.json into [{ url, label }].
 * Throws with a clear message on invalid config.
 */
async function loadTargets() {
    let raw;
    try {
        raw = await fs.readFile(CONFIG_PATH, 'utf8');
    } catch (e) {
        throw new Error(`Could not read ${CONFIG_PATH}: ${e.message}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(`targets.json is not valid JSON: ${e.message}`);
    }

    if (!Array.isArray(parsed.targets) || parsed.targets.length === 0) {
        throw new Error('targets.json must contain a non-empty "targets" array');
    }

    return parsed.targets.map((entry, i) => {
        const url = typeof entry === 'string' ? entry : entry?.url;
        const label = typeof entry === 'string' ? null : entry?.label ?? null;

        if (typeof url !== 'string' || !SELLPY_REGEX.test(url)) {
            throw new Error(`targets[${i}] has an invalid Sellpy URL: ${JSON.stringify(entry)}`);
        }
        return { url: url.trim(), label };
    });
}

module.exports = { loadTargets };
