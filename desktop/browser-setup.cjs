const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

const DEFINITIONS = {
  Chrome: { url: 'chrome://extensions/', candidates: [
    ['LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'], ['ProgramFiles', 'Google/Chrome/Application/chrome.exe'], ['ProgramFiles(x86)', 'Google/Chrome/Application/chrome.exe']
  ] },
  Edge: { url: 'edge://extensions/', candidates: [
    ['ProgramFiles(x86)', 'Microsoft/Edge/Application/msedge.exe'], ['ProgramFiles', 'Microsoft/Edge/Application/msedge.exe'], ['LOCALAPPDATA', 'Microsoft/Edge/Application/msedge.exe']
  ] },
  Brave: { url: 'brave://extensions/', candidates: [
    ['LOCALAPPDATA', 'BraveSoftware/Brave-Browser/Application/brave.exe'], ['ProgramFiles', 'BraveSoftware/Brave-Browser/Application/brave.exe'], ['ProgramFiles(x86)', 'BraveSoftware/Brave-Browser/Application/brave.exe']
  ] },
  Opera: { url: 'opera://extensions/', candidates: [
    ['LOCALAPPDATA', 'Programs/Opera/launcher.exe'], ['LOCALAPPDATA', 'Programs/Opera GX/launcher.exe'], ['ProgramFiles', 'Opera/launcher.exe'], ['ProgramFiles(x86)', 'Opera/launcher.exe']
  ] },
  Firefox: { url: 'about:debugging#/runtime/this-firefox', firefox: true, candidates: [
    ['ProgramFiles', 'Mozilla Firefox/firefox.exe'], ['ProgramFiles(x86)', 'Mozilla Firefox/firefox.exe'], ['LOCALAPPDATA', 'Mozilla Firefox/firefox.exe']
  ] }
};

// macOS: browsers are .app bundles, started with `open -a`.
const MAC_APPS = { Chrome: 'Google Chrome.app', Edge: 'Microsoft Edge.app', Brave: 'Brave Browser.app', Opera: 'Opera.app', Firefox: 'Firefox.app' };

function definitionFor(browser) {
  const definition = DEFINITIONS[browser];
  if (!definition) throw new Error('Choose Chrome, Edge, Brave, Opera, or Firefox.');
  return definition;
}

async function findBrowserExecutable(browser, environment = process.env, platform = process.platform) {
  const definition = definitionFor(browser);
  if (platform === 'darwin') {
    for (const root of ['/Applications', environment.HOME && path.join(environment.HOME, 'Applications')].filter(Boolean)) {
      const app = path.join(root, MAC_APPS[browser]);
      try { await fs.access(app); return app; } catch { /* Try the next location. */ }
    }
    return null;
  }
  for (const [rootName, relative] of definition.candidates) {
    const root = environment[rootName];
    if (!root) continue;
    const executable = path.join(root, relative);
    try { await fs.access(executable); return executable; } catch { /* Try the next supported location. */ }
  }
  return null;
}

function launch(executable, args) {
  // On macOS the "executable" is an .app bundle, which `open -a` starts.
  const [command, commandArgs] = executable.endsWith('.app') ? ['open', ['-a', executable, ...args]] : [executable, args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function openBrowser(browser, environment = process.env) {
  definitionFor(browser);
  const executable = await findBrowserExecutable(browser, environment);
  if (!executable) throw new Error(`${browser} was not found.`);
  await launch(executable, []);
  return { browser };
}
async function openExtensionStore(browser, environment = process.env) {
  const { STORE_URL, storeBrowser } = require('./extension-store.cjs');
  if (!storeBrowser(browser)) throw new Error('No published store extension is configured for this browser.');
  const executable = await findBrowserExecutable(browser, environment);
  if (!executable) throw new Error(`${browser} was not found.`);
  await launch(executable, [STORE_URL]);
  return { browser };
}
module.exports = { MAC_APPS, DEFINITIONS, definitionFor, findBrowserExecutable, openBrowser, openExtensionStore };
