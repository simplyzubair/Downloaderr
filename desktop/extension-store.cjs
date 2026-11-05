// Downloaderr's own Chrome Web Store listing. None is published: the owner uses
// Downloaderr's bundled extension ("Load unpacked", decision 2026-11-05). Put the
// 32-letter ID here if a listing owned by simplyzubair is ever published.
const EXTENSION_ID = null;
const STORE_URL = EXTENSION_ID ? `https://chromewebstore.google.com/detail/${EXTENSION_ID}` : null;
const storeBrowser = browser => Boolean(EXTENSION_ID) && ['Chrome', 'Edge', 'Brave'].includes(browser);

// The upstream Awesome Downloader listing belongs to another developer, who can
// change its code at any time. It is never trusted to talk to this app.
const UNTRUSTED_EXTENSION_IDS = new Set(['dnolinbkicmedadaigcedkmndcpahmml']);

module.exports = { EXTENSION_ID, STORE_URL, storeBrowser, UNTRUSTED_EXTENSION_IDS };
