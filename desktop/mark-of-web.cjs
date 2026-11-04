// Windows "Mark of the Web": the Zone.Identifier stream that browsers add to
// downloads, so SmartScreen and Office warn before opening a file from the internet.
const fs = require('node:fs/promises');

// Keep only scheme, host and path: query strings often hold signed tokens.
function cleanUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return ''; }
}

function zoneIdentifier(url) {
  const host = cleanUrl(url);
  return `[ZoneTransfer]\r\nZoneId=3\r\n${host ? `HostUrl=${host}\r\n` : ''}`;
}

async function markFromInternet(filePath, url, { platform = process.platform, writeFile = fs.writeFile } = {}) {
  if (platform !== 'win32' || !filePath) return false;
  // FAT32/exFAT drives and some network shares have no alternate streams; the file stays usable.
  try { await writeFile(`${filePath}:Zone.Identifier`, zoneIdentifier(url), 'utf8'); return true; }
  catch { return false; }
}

module.exports = { cleanUrl, zoneIdentifier, markFromInternet };
