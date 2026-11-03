const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdateController, CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS } = require('../desktop/updater.cjs');

function harness({ packaged = true, active = 0, responses = [] } = {}) {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { updater.checked = (updater.checked || 0) + 1; };
  const boxes = [], notifications = [], changes = [];
  const dialog = { showMessageBox: async (...args) => { boxes.push(args.at(-1)); return { response: responses.shift() ?? 1 }; } };
  let installed = 0;
  const controller = createUpdateController({ autoUpdater: updater, app: { isPackaged: packaged, getVersion: () => '0.2.1' }, dialog, getWindow: () => ({ isDestroyed: () => false }), activeDownloadCount: () => active, notify: (title, body, click) => notifications.push({ title, body, click }), onChange: status => changes.push({ ...status }), installUpdate: async () => { installed += 1; } });
  return { updater, boxes, notifications, changes, controller, installed: () => installed };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('updates download automatically and install on quit', () => {
  const h = harness();
  assert.equal(h.updater.autoDownload, true);
  assert.equal(h.updater.autoInstallOnAppQuit, true);
});
test('manual check reports when the installed version is current', async () => {
  const h = harness();
  await h.controller.check({ manual: true });
  h.updater.emit('update-not-available', { version: '0.2.1' });
  await settle();
  assert.equal(h.updater.checked, 1);
  assert.equal(h.boxes.at(-1).title, 'No updates available');
});
test('automatic current-version checks stay silent', async () => {
  const h = harness();
  await h.controller.check();
  h.updater.emit('update-not-available', { version: '0.2.1' });
  await settle();
  assert.equal(h.boxes.length, 0);
  assert.equal(h.controller.status().state, 'latest');
});
test('automatic missing-release checks stay silent', async () => {
  const h = harness();
  await h.controller.check();
  h.updater.emit('error', new Error('Unable to find latest version on GitHub (https://github.com/simplyzubair/Downloaderr/releases/latest): HTTPError: 406'));
  await settle();
  assert.equal(h.boxes.length, 0);
});
test('the updater checks soon after start and then every hour', () => {
  const originalInterval = global.setInterval, originalTimeout = global.setTimeout;
  const intervals = [], timeouts = [];
  global.setInterval = (callback, delay) => { intervals.push(delay); return { unref() {} }; };
  global.setTimeout = (callback, delay) => { timeouts.push(delay); return { unref() {} }; };
  try {
    harness().controller.start();
    assert.deepEqual(intervals, [CHECK_INTERVAL_MS]);
    assert.deepEqual(timeouts, [FIRST_CHECK_DELAY_MS]);
    assert.equal(CHECK_INTERVAL_MS, 60 * 60 * 1000);
  } finally { global.setInterval = originalInterval; global.setTimeout = originalTimeout; }
});
test('a new version reports download progress, then shows Update now without a dialog', async () => {
  const h = harness();
  await h.controller.check();
  h.updater.emit('update-available', { version: '0.2.2' });
  h.updater.emit('download-progress', { percent: 41.6 });
  assert.deepEqual(h.changes.at(-1), { state: 'downloading', version: '0.2.2', percent: 42 });
  h.updater.emit('update-downloaded', { version: '0.2.2' });
  await settle();
  assert.equal(h.controller.status().state, 'ready');
  assert.equal(h.boxes.length, 0);
  assert.equal(h.notifications.length, 1);
  assert.match(h.notifications[0].title, /update ready/i);
});
test('Update now installs straight away when nothing is downloading', async () => {
  const h = harness();
  h.updater.emit('update-downloaded', { version: '0.2.2' });
  assert.equal(await h.controller.install(), true);
  assert.equal(h.installed(), 1);
  assert.equal(h.boxes.length, 0);
});
test('Update now asks first while downloads are active, defaulting to Later', async () => {
  const h = harness({ active: 2, responses: [1] });
  h.updater.emit('update-downloaded', { version: '0.2.2' });
  assert.equal(await h.controller.install(), false);
  assert.equal(h.boxes.at(-1).defaultId, 1);
  assert.match(h.boxes.at(-1).detail, /2 downloads are running/);
  assert.equal(h.installed(), 0);
});
test('install does nothing before an update is ready', async () => {
  const h = harness();
  assert.equal(await h.controller.install(), false);
  assert.equal(h.installed(), 0);
});
test('missing GitHub production release is treated as up to date without raw response data', async () => {
  const h = harness();
  await h.controller.check({ manual: true });
  h.updater.emit('error', new Error('Unable to find latest version on GitHub (https://github.com/simplyzubair/Downloaderr/releases/latest), please ensure a production release exists: HTTPError: 406\nHeaders: secret-noisy-response'));
  await settle();
  assert.equal(h.boxes.at(-1).title, 'No updates available');
  assert.doesNotMatch(h.boxes.at(-1).detail, /Headers|secret/i);
});
test('real update errors show a short safe explanation', async () => {
  const h = harness();
  await h.controller.check({ manual: true });
  h.updater.emit('error', new Error('ETIMEDOUT with a very long internal response'));
  await settle();
  assert.equal(h.boxes.at(-1).title, 'Could not check for updates');
  assert.match(h.boxes.at(-1).detail, /internet connection/i);
  assert.doesNotMatch(h.boxes.at(-1).detail, /internal response/i);
});
test('development build never contacts GitHub', async () => {
  const h = harness({ packaged: false });
  await h.controller.check({ manual: true });
  assert.equal(h.updater.checked, undefined);
  assert.equal(h.boxes.at(-1).title, 'Updates are unavailable in development');
});
