const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanUrl, zoneIdentifier, markFromInternet } = require('../desktop/mark-of-web.cjs');

test('the internet zone mark keeps the host and path but drops tokens and passwords', () => {
  assert.equal(cleanUrl('https://user:secret@cdn.example.com/files/app.exe?token=abc#x'), 'https://cdn.example.com/files/app.exe');
  assert.equal(cleanUrl('file:///C:/secret.txt'), '');
  assert.equal(cleanUrl('not a url'), '');
  assert.equal(zoneIdentifier('https://cdn.example.com/app.exe?sig=1'), '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://cdn.example.com/app.exe\r\n');
  assert.equal(zoneIdentifier(''), '[ZoneTransfer]\r\nZoneId=3\r\n');
});
test('files are only marked on Windows, and a failed mark never throws', async () => {
  const writes = [];
  assert.equal(await markFromInternet('C:\\d\\a.exe', 'https://x.test/a.exe', { platform: 'darwin', writeFile: async (...args) => writes.push(args) }), false);
  assert.equal(writes.length, 0);
  assert.equal(await markFromInternet('C:\\d\\a.exe', 'https://x.test/a.exe', { platform: 'win32', writeFile: async () => { throw new Error('no streams'); } }), false);
  assert.equal(await markFromInternet('C:\\d\\a.exe', 'https://x.test/a.exe', { platform: 'win32', writeFile: async (...args) => writes.push(args) }), true);
  assert.equal(writes[0][0], 'C:\\d\\a.exe:Zone.Identifier');
});
test('on NTFS the mark is a real alternate stream and leaves the file content alone', { skip: process.platform !== 'win32' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'downloaderr-motw-'));
  try {
    const file = path.join(dir, 'tool.exe');
    await fs.writeFile(file, 'payload');
    assert.equal(await markFromInternet(file, 'https://example.com/tool.exe?x=1'), true);
    assert.equal(await fs.readFile(file, 'utf8'), 'payload');
    assert.match(await fs.readFile(`${file}:Zone.Identifier`, 'utf8'), /ZoneId=3/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
