const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

// macData/macHosts are relative to ~/Library/Application Support.
const BROWSERS = {
  Chrome: { registry: 'Google\\Chrome', data: 'Google/Chrome/User Data', dataRoot: 'local', macData: 'Google/Chrome', macHosts: 'Google/Chrome/NativeMessagingHosts' },
  Edge: { registry: 'Microsoft\\Edge', data: 'Microsoft/Edge/User Data', dataRoot: 'local', macData: 'Microsoft Edge', macHosts: 'Microsoft Edge/NativeMessagingHosts' },
  Brave: { registry: 'BraveSoftware\\Brave-Browser', data: 'BraveSoftware/Brave-Browser/User Data', dataRoot: 'local', macData: 'BraveSoftware/Brave-Browser', macHosts: 'BraveSoftware/Brave-Browser/NativeMessagingHosts' },
  // Opera documents that its native host is registered under Chrome.
  Opera: { registry: 'Google\\Chrome', data: 'Opera Software/Opera Stable', dataRoot: 'roaming', rootProfile: true, macData: 'com.operasoftware.Opera', macHosts: 'Google/Chrome/NativeMessagingHosts' },
  Firefox: { registry: 'Mozilla', data: 'Mozilla/Firefox/Profiles', dataRoot: 'roaming', firefox: true, macData: 'Firefox/Profiles', macHosts: 'Mozilla/NativeMessagingHosts' }
};
const macSupport = home => path.join(home, 'Library', 'Application Support');
const hostLauncher = platform => platform === 'darwin' ? 'native-host.sh' : 'native-host.exe';

function browserSpec(browser) {
  const spec = BROWSERS[browser];
  if (!spec) throw new Error('Choose Chrome, Edge, Brave, Opera, or Firefox.');
  return spec;
}

async function registerBrowser({ browser, extensionId }, { dataDirectory, integrationRoot, platform = process.platform, home = os.homedir() }) {
  const spec=browserSpec(browser);
  if (typeof extensionId !== 'string' || !(spec.firefox ? /^[A-Za-z0-9@._{}-]{1,128}$/ : /^[a-p]{32}$/).test(extensionId)) throw new Error('Copy the extension ID from your browser’s extensions page.');
  const host = 'com.awesome.downloader';
  const key = `HKCU\\Software\\${spec.registry}\\NativeMessagingHosts\\${host}`;
  const mac = platform === 'darwin';
  const folder = path.join(dataDirectory, 'NativeMessaging');
  // Opera and Chrome intentionally share the Chrome registry location and
  // therefore one allow-list manifest instead of replacing each other.
  const manifestName=browser==='Opera'?'Chrome':browser;
  // macOS has no registry: each browser reads the manifest from a fixed folder.
  const manifestFolder = mac ? path.join(macSupport(home), spec.macHosts) : folder;
  const manifestPath = mac ? path.join(manifestFolder, `${host}.json`) : path.join(folder, `${manifestName}.json`);
  const manifest = { name: host, description: 'Downloaderr browser bridge', path: path.join(integrationRoot, 'integration', hostLauncher(platform)), type: 'stdio' };
  if (spec.firefox) manifest.allowed_extensions = [extensionId];
  else manifest.allowed_origins = [`chrome-extension://${extensionId}/`];
  await fs.access(manifest.path);
  await fs.mkdir(folder, { recursive: true });
  await fs.mkdir(manifestFolder, { recursive: true });
  let previous;
  try { previous = await fs.readFile(manifestPath, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if(previous&&!spec.firefox){
    try {
      const old=JSON.parse(previous);
      manifest.allowed_origins=[...new Set([...(old.allowed_origins||[]),...manifest.allowed_origins])].filter(value=>/^chrome-extension:\/\/[a-p]{32}\/$/.test(value));
    } catch { /* The invalid file is backed up and replaced below. */ }
  }
  const content = JSON.stringify(manifest, null, 2);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  if (previous && previous !== content) await fs.writeFile(`${manifestPath}.${stamp}.bak`, previous);
  let registry = null;
  if (!mac) try { registry = (await exec('reg.exe', ['QUERY', key, '/ve'], { windowsHide: true })).stdout; }
  catch (error) { if (error.code !== 1) throw error; }
  const previousPath = registry?.match(/REG_SZ\s+(.+)\r?\n?/)?.[1]?.trim();
  if (registry && previousPath !== manifestPath) await fs.writeFile(path.join(folder, `${browser}.${stamp}.registry-backup.txt`), registry);
  if (previous !== content) await fs.writeFile(manifestPath, content, 'utf8');
  if (!mac && previousPath !== manifestPath) await exec('reg.exe', ['ADD', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { windowsHide: true });
  let extensionPath = path.join(integrationRoot, 'extension');
  if (spec.firefox) {
    extensionPath = path.join(folder, 'firefox-extension');
    await fs.cp(path.join(integrationRoot, 'extension'), extensionPath, { recursive: true });
    await fs.copyFile(path.join(extensionPath, 'manifest.firefox.json'), path.join(extensionPath, 'manifest.json'));
  }
  return { ok: true, manifestPath, extensionPath };
}
// Read only extension registrations, never browser history, cookies, or page data.
async function connectInstalledBrowsers({ dataDirectory, integrationRoot, platform = process.platform, home = os.homedir(), localAppData = process.env.LOCALAPPDATA, roamingAppData = process.env.APPDATA }, { register = registerBrowser, includeSetupState = false } = {}) {
  const results = [];
  const mac = platform === 'darwin';
  if (mac) localAppData = roamingAppData = macSupport(home);
  const dataOf = spec => mac ? spec.macData : spec.data;
  const expected = await fs.realpath(path.join(integrationRoot, 'extension'));
  for (const [browser, spec] of Object.entries(BROWSERS).filter(([,value])=>!value.firefox)) {
    const base=spec.dataRoot==='roaming'?roamingAppData:localAppData;
    if(!base)continue;
    const root = path.join(base, dataOf(spec));
    let profiles;
    try { profiles = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    if(spec.rootProfile)profiles=[{name:'.',isDirectory:()=>true},...profiles];
    const ids = new Set(), matchedProfiles = new Set(), setupStates = [];
    for (const profile of profiles.filter(p => p.isDirectory() && (p.name==='.'||/^(Default|Profile \d+)$/.test(p.name)))) {
      const inspected = await require('./browser-extension-state.cjs').readProfile(path.join(root, profile.name));
      setupStates.push(inspected.state);
        try {
          const settings = inspected.settings;
          for (const [id, entry] of Object.entries(settings)) {
            if (id === require('./extension-store.cjs').EXTENSION_ID) {
              if (inspected.state === 'connected') {
                ids.add(id); matchedProfiles.add(profile.name);
              }
              continue;
            }
            if (require('./browser-extension-state.cjs').disabled(entry)) continue;
            if (!/^[a-p]{32}$/.test(id) || !entry.path || !path.isAbsolute(entry.path)) continue;
            const installed = await fs.realpath(entry.path).catch(() => null);
            let ownExtension=mac?installed===expected:installed?.toLowerCase()===expected.toLowerCase();
            if(installed&&!ownExtension){
              const manifest=JSON.parse(await fs.readFile(path.join(installed,'manifest.json'),'utf8'));
              const background=await fs.readFile(path.join(installed,'background.js'),'utf8');
              ownExtension=['Downloaderr Integration','Awesome Downloader Integration'].includes(manifest.name)&&manifest.background?.service_worker==='background.js'&&background.includes("const HOST = 'com.awesome.downloader'");
            }
            if (ownExtension) { ids.add(id); matchedProfiles.add(profile.name); }
          }
        } catch { /* A running browser can temporarily replace a preference file. */ }
    }
    if (ids.size) {
      let result;
      for(const extensionId of ids)result=await register({ browser, extensionId }, { dataDirectory, integrationRoot, platform, home });
      results.push({ browser, connected: true, profiles: matchedProfiles.size });
    } else if (includeSetupState) {
      const setupState = ['approval', 'disabled', 'removed'].find(value => setupStates.includes(value)) || 'missing';
      results.push({ browser, connected: false, profiles: 0, setupState });
    }
  }
  const firefoxRoot = roamingAppData && path.join(roamingAppData, dataOf(BROWSERS.Firefox));
  if (firefoxRoot) {
    const matchedProfiles = [];
    let profiles = [];
    try { profiles = await fs.readdir(firefoxRoot, { withFileTypes: true }); } catch { /* Firefox is not installed or has no profile yet. */ }
    for (const profile of profiles.filter(entry => entry.isDirectory())) {
      try {
        const extensions = JSON.parse(await fs.readFile(path.join(firefoxRoot, profile.name, 'extensions.json'), 'utf8')).addons || [];
        if (extensions.some(addon => addon.id === 'awesome-downloader@morluto.local' && addon.active !== false && addon.appDisabled !== true)) matchedProfiles.push(profile.name);
      } catch { /* A running browser can temporarily replace its add-on database. */ }
    }
    if (matchedProfiles.length) {
      await register({ browser: 'Firefox', extensionId: 'awesome-downloader@morluto.local' }, { dataDirectory, integrationRoot, platform, home });
      results.push({ browser: 'Firefox', connected: true, profiles: matchedProfiles.length });
    }
  }
  return results;
}
async function prepareNativeHost(integrationRoot, executable, platform = process.platform) {
  const folder = path.join(integrationRoot, 'integration');
  if (platform === 'darwin') {
    // The browser starts this script, which runs native-host.cjs with Downloaderr's own runtime.
    const script = path.join(folder, 'native-host.sh');
    const quoted = `'${String(executable).replaceAll("'", "'\\''")}'`;
    await fs.writeFile(script, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quoted} "$(dirname "$0")/native-host.cjs"\n`);
    await fs.chmod(script, 0o755);
    return;
  }
  const target = path.join(folder, 'native-host.exe');
  try { await fs.access(target); }
  catch {
    const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    await exec(compiler, ['/nologo', '/target:exe', `/out:${target}`, path.join(folder, 'NativeHostLauncher.cs')], { windowsHide: true });
  }
  await fs.writeFile(path.join(folder, 'runtime-path.txt'), executable, 'utf8');
}
module.exports = { BROWSERS, macSupport, browserSpec, registerBrowser, connectInstalledBrowsers, prepareNativeHost };
