// New versions download quietly in the background. The user installs them with
// the "Update now" button (window, tray menu or notification); otherwise the
// update installs when Downloaderr quits.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15 * 1000;

function noPublishedRelease(error) {
  const message = error?.message || String(error || '');
  return /unable to find latest version on github/i.test(message) || (/releases\/latest/i.test(message) && /(?:HTTPError:\s*)?(?:404|406)\b/i.test(message));
}

function friendlyUpdateError(error) {
  const message = error?.message || String(error || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|offline/i.test(message)) return 'Could not reach GitHub Releases. Check your internet connection and try again.';
  return 'GitHub Releases returned an unexpected response. Please try again later.';
}

function createUpdateController({ autoUpdater, app, dialog, getWindow, activeDownloadCount = () => 0, notify = () => {}, onChange = () => {}, installUpdate, canInstall = true, openDownloadPage = () => {} }) {
  // state: idle | checking | downloading | ready | available (cannot self-install) | latest | error
  let status = { state: 'idle', version: null, percent: 0 };
  let manualCheck = false;

  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.allowPrerelease = app.getVersion().includes('-');

  const setStatus = next => { status = { ...status, ...next }; onChange(status); };
  const messageBox = options => {
    const parent = getWindow?.();
    return parent && !parent.isDestroyed?.() ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
  };
  const showCurrentVersion = () => messageBox({ type: 'info', title: 'No updates available', message: 'Downloaderr is up to date.', detail: `You are using version ${app.getVersion()}.`, buttons: ['Close'] });
  const finishManual = () => { const manual = manualCheck; manualCheck = false; return manual; };

  autoUpdater.on('checking-for-update', () => { if (status.state !== 'ready') setStatus({ state: 'checking' }); });
  autoUpdater.on('update-available', info => {
    finishManual();
    if (canInstall) { setStatus({ state: 'downloading', version: info.version, percent: 0 }); return; }
    setStatus({ state: 'available', version: info.version, percent: 0 });
    notify('Downloaderr update available', `Version ${info.version} is out. Click to download it.`, () => install());
  });
  autoUpdater.on('download-progress', progress => setStatus({ state: 'downloading', percent: Math.round(progress.percent || 0) }));
  autoUpdater.on('update-not-available', async () => {
    setStatus({ state: 'latest' });
    if (finishManual()) await showCurrentVersion();
  });
  autoUpdater.on('update-downloaded', info => {
    finishManual();
    setStatus({ state: 'ready', version: info.version, percent: 100 });
    notify('Downloaderr update ready', `Version ${info.version} is ready. Click to update now.`, () => install());
  });
  autoUpdater.on('error', async error => {
    const manual = finishManual();
    // Offline or no release yet: stay quiet unless the user asked.
    if (status.state !== 'ready') setStatus({ state: noPublishedRelease(error) ? 'latest' : 'error' });
    if (!manual) return;
    if (noPublishedRelease(error)) await showCurrentVersion();
    else await messageBox({ type: 'error', title: 'Could not check for updates', message: 'Downloaderr could not check for updates.', detail: friendlyUpdateError(error), buttons: ['Close'] });
  });

  const check = async ({ manual = false } = {}) => {
    if (!app.isPackaged) {
      if (manual) await messageBox({ type: 'info', title: 'Updates are unavailable in development', message: 'Update checks run in installed builds.', buttons: ['Close'] });
      return;
    }
    if (['ready', 'available'].includes(status.state)) { if (manual) await install(); return; }
    if (['checking', 'downloading'].includes(status.state)) return;
    manualCheck = manual;
    try { await autoUpdater.checkForUpdates(); }
    catch (error) { autoUpdater.emit('error', error); }
  };
  const install = async () => {
    if (status.state === 'available') { await openDownloadPage(); return true; }
    if (status.state !== 'ready') return false;
    const active = activeDownloadCount();
    if (active) {
      const result = await messageBox({ type: 'question', title: 'Update now?', message: `Update to Downloaderr ${status.version} now?`, detail: `${active} download${active === 1 ? ' is' : 's are'} running. They stop during the update, and you can resume them afterwards. Choose Later to let them finish; the update then installs when you quit Downloaderr.`, buttons: ['Update now', 'Later'], defaultId: 1, cancelId: 1, noLink: true });
      if (result.response !== 0) return false;
    }
    await installUpdate();
    return true;
  };
  const start = () => {
    const first = setTimeout(() => check(), FIRST_CHECK_DELAY_MS);
    first.unref?.();
    const recurring = setInterval(() => check(), CHECK_INTERVAL_MS);
    recurring.unref?.();
    return () => { clearTimeout(first); clearInterval(recurring); };
  };
  return { check, install, start, status: () => status };
}

module.exports = { createUpdateController, noPublishedRelease, friendlyUpdateError, CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS };
