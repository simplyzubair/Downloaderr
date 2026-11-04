'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const api = window.downloader;
const progressMode = new URLSearchParams(location.search).get('progress');
const integrationMode = new URLSearchParams(location.search).get('integration') === '1';
const optionsMode = new URLSearchParams(location.search).get('options') === '1';
const addMode = new URLSearchParams(location.search).get('add') === '1';
const schedulerMode = new URLSearchParams(location.search).get('scheduler') === '1';
if(progressMode)document.body.classList.add('progress-window');
if(integrationMode)document.body.classList.add('integration-window');
if(optionsMode)document.body.classList.add('options-window');
if(addMode)document.body.classList.add('add-window');
if(schedulerMode)document.body.classList.add('scheduler-window');
if(integrationMode)document.title = 'Browser extension';
if(optionsMode)document.title = 'Settings';
if(addMode)document.title = 'New download';
if(schedulerMode)document.title = 'Scheduler';
let state = { downloads: [], settings: {}, integration: {}, fileIcons: {} }, selectedId = null, selectionAnchorId = null, detailId = null, filter = 'all', category = '', searchTerm = '', sort = 'createdAt', ascending = false, visibleDownloads = [], toastTimer, unsubscribe, unsubscribeCommands;
const selectedIds = new Set();
const pending = new Set();
let pendingReviewId = null;
let selectionDrag = null, suppressRowClick = false;
const dismissedReviews = new Set();
// 24px line icons, drawn with stroke="currentColor" by the stylesheet.
const iconPaths = {
  add:['M12 5v14M5 12h14'],
  resume:['M8 5.5v13l10.5-6.5z'],
  stop:['M9 5v14M15 5v14'],
  stopall:['M6 6h12v12H6z'],
  delete:['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  clear:['M2 12.5l4.5 4.5L15 8.5','M12 15.5l1.5 1.5L22 8.5'],
  options:['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z','M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6'],
  clock:['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18','M12 7.5V12l3 2'],
  startqueue:['M3 6h11M3 12h7M3 18h7','M14 12.5v7l6-3.5z'],
  stopqueue:['M3 6h11M3 12h7M3 18h7','M14 13h6v6h-6z'],
  browser:['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18','M3 12h18M12 3c-2.8 2.6-4.2 5.6-4.2 9s1.4 6.4 4.2 9M12 3c2.8 2.6 4.2 5.6 4.2 9s-1.4 6.4-4.2 9'],
  open:['M14 4h6v6M10 14L20 4','M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  folder:['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  info:['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18','M12 11v5M12 8h.01'],
  all:['M12 3v11M7.5 9.5L12 14l4.5-4.5','M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  unfinished:['M12 3a9 9 0 1 0 9 9','M21 3v6h-6'],
  finished:['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18','M8 12.5l2.8 2.8L16 9.8'],
  queues:['M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01'],
  video:['M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','M16 10l5-3v10l-5-3'],
  music:['M9 18V5l11-2v13','M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0'],
  document:['M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z','M14 3v5h5M9 13h6M9 17h6'],
  archive:['M3 5h18v4H3z','M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4'],
  program:['M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','M3 9h18M7 6.5h.01M10 6.5h.01'],
  other:['M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z','M14 3v5h5'],
  search:['M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14','M20 20l-4-4'],
  more:['M5 12h.01M12 12h.01M19 12h.01'],
  close:['M6 6l12 12M18 6L6 18'],
  speed:['M4.5 18a9 9 0 1 1 15 0','M12 14l4.5-4.5'],
  size:['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3s-3.6 3-8 3s-8-1.3-8-3z','M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6','M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  check:['M5 12.5l4.5 4.5L19 7.5']
};
function iconSvg(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
  for (const data of iconPaths[name] || []) { const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',data); svg.append(path); }
  return svg;
}
const categoryIcons = {Video:'video',Audio:'music',Documents:'document',Archives:'archive',Programs:'program',Other:'other'};
for (const host of $$('[data-icon]')) {
  host.prepend(iconSvg(host.dataset.icon));
  // Toolbar labels collapse to icons on narrow windows; keep a tooltip.
  if (host.matches('button') && !host.title) host.title = host.textContent.trim();
}
function element(tag,className,text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
// Native Windows icon for the file type when known, otherwise a tinted category tile.
function extensionOf(d) { return (String(d.filename||d.path||'').match(/\.[a-z0-9]{1,12}$/i)?.[0]||'').toLowerCase(); }
function fileIcon(d) { const nativeIcon = state.fileIcons?.[extensionOf(d)]; if (nativeIcon) { const icon = element('img','file-type-icon native-file-icon'); icon.src = nativeIcon; icon.alt = ''; return icon; } const kind = categoryOf(d), tile = element('span',`file-type-icon file-type-fallback tone-${kind.toLowerCase()}`); tile.append(iconSvg(categoryIcons[kind])); return tile; }
const rememberLabel = element('label','checkbox-label'); const rememberInput = element('input'); rememberInput.type = 'checkbox'; rememberInput.id = 'remember-category-path'; rememberInput.disabled = true; rememberLabel.append(rememberInput,document.createTextNode('Remember this folder for the selected category'));
$('#add-directory').closest('.form-line').after(rememberLabel);
let integrationBrowsers = [], selectedBrowserName = null, setupPolling = false;
const browserStatus = browser => browser.connected ? ['Connected','connected'] : !browser.installed ? ['Not installed','missing'] : browser.setupState === 'approval' ? ['Enable extension','setup'] : browser.setupState === 'disabled' ? ['Disabled','setup'] : browser.setupState === 'removed' ? ['Reinstall needed','setup'] : ['Setup needed','setup'];
const storeFallback = element('button','button','Install from Web Store'); storeFallback.type = 'button'; storeFallback.id = 'browser-store-action';
$('#browser-primary-action').after(storeFallback);
storeFallback.addEventListener('click',()=>runBrowserSetup('store'));
function browserIcon(browser, className = '') {
  const frame = element('span',`browser-icon-frame ${className}`.trim());
  if (browser.icon) { const image = element('img'); image.src = browser.icon; image.alt = ''; frame.append(image); }
  else frame.append(element('span','browser-monogram',browser.name.slice(0,1)));
  return frame;
}
function renderBrowserGrid(info) {
  integrationBrowsers = Array.isArray(info.browsers) ? info.browsers.filter(browser=>browser.installed || browser.connected) : [];
  const grid = $('#browser-grid'); grid.replaceChildren();
  for (const browser of integrationBrowsers) {
    const [label,tone] = browserStatus(browser), card = element('button','browser-card');
    card.type = 'button'; card.setAttribute('role','listitem'); card.dataset.browser = browser.name;
    const copy = element('span','browser-card-copy');
    const subtitle = browser.connected ? `Connected in ${browser.profiles || 1} profile${browser.profiles === 1 ? '' : 's'}` : browser.setupState === 'approval' ? 'Downloaded; waiting for your approval' : browser.setupState === 'disabled' ? 'Enable it in your browser' : browser.setupState === 'removed' ? 'Previously removed from this browser' : 'Extension not detected';
    copy.append(element('strong','',browser.name),element('span','browser-card-subtitle',subtitle));
    const status = element('span',`browser-status ${tone}`,label);
    card.append(browserIcon(browser),copy,status);
    card.addEventListener('click',()=>showBrowserDetail(browser.name));
    grid.append(card);
  }
  const connected = integrationBrowsers.filter(browser=>browser.connected).length;
  $('#browser-connection-summary').textContent = info.connectionError ? `Setup check failed: ${info.connectionError}` : `${connected} browser${connected === 1 ? '' : 's'} connected`;
  if (selectedBrowserName && integrationBrowsers.some(browser=>browser.name === selectedBrowserName)) showBrowserDetail(selectedBrowserName);
}
function showBrowserDetail(name) {
  const browser = integrationBrowsers.find(item=>item.name === name); if (!browser) return;
  selectedBrowserName = name; $('#browser-grid').hidden = true; $('#browser-detail').hidden = false;
  const icon = $('#browser-detail-icon'); icon.replaceChildren(...browserIcon(browser).childNodes);
  $('#browser-detail-name').textContent = browser.name;
  const [label,tone] = browserStatus(browser); $('#browser-detail-status').textContent = label; $('#browser-detail-status').className = `browser-detail-status ${tone}`;
  $('#extension-path').value = browser.extensionPath || '';
  const primary = $('#browser-primary-action'); primary.disabled = !browser.installed; primary.dataset.browser = browser.name;
  const enableExisting = ['approval','disabled'].includes(browser.setupState);
  primary.dataset.action = browser.storeUrl && !enableExisting && !browser.connected ? 'store' : browser.name === 'Firefox' ? 'prepare' : 'open';
  primary.textContent = primary.dataset.action === 'store' ? (browser.setupState === 'removed' ? 'Reinstall extension' : 'Install browser extension') : `Open ${browser.name}`;
  storeFallback.hidden = !browser.storeUrl || primary.dataset.action === 'store';
  $('#browser-detail-summary').textContent = browser.connected ? 'The extension and desktop connector are ready. Refresh an existing video tab if its download button is missing.' : browser.setupState === 'removed' ? `${browser.name} remembers an earlier removal and will not add this extension automatically. Reinstall it from the official store to reconnect.` : browser.setupState === 'approval' ? `${browser.name} has downloaded the extension. Enable it in the browser to finish setup.` : browser.setupState === 'disabled' ? `The extension is installed but disabled. Enable it in ${browser.name} to reconnect.` : 'Complete this one-time setup for this browser. If you just installed the app, fully close and reopen this browser to see its extension approval prompt.';
  const steps = $('#browser-steps'); steps.replaceChildren();
  const texts = browser.storeUrl && (enableExisting || browser.connected) ? [
    `Click Open ${browser.name}. Use the browser's Action required menu to enable Downloaderr Integration if that prompt is shown.`,
    `Otherwise, enter ${browser.extensionPage} in the address bar and enable Downloaderr Integration.`,
    'Return here and click Refresh, then reload your video page. If the extension is missing, use Install from Web Store.'
  ] : browser.storeUrl ? [
    `Click ${browser.setupState === 'removed' ? 'Reinstall extension' : 'Install browser extension'} to open the official Chrome Web Store listing in this browser.`,
    'Click Add to Chrome (or the equivalent button in your browser), then confirm the installation.',
    'The desktop connector is prepared automatically. Return here and click Refresh, then reload your video page.'
  ] : browser.name === 'Firefox' ? [
    'Click Open Firefox. Downloaderr prepares the Firefox extension, registers its local connector, and opens Firefox.',
    `Enter ${browser.extensionPage} in Firefox's address bar.`,
    'On the Firefox page, select This Firefox, then Load Temporary Add-on.',
    'Choose manifest.json inside the extension folder shown below.',
    'Return here, click Refresh, then reload your video page.'
  ] : [
    `Click Open ${browser.name}.`,
    `Enter ${browser.extensionPage} in ${browser.name}'s address bar.`,
    'Turn on Developer mode on the Extensions page.',
    'Choose Load unpacked. In the Windows folder picker, paste the extension folder path shown below into the address bar.',
    'Select the extension folder itself, then return here and click Refresh.',
    'Reload your video page. The Download this video button should appear when playable media is detected.'
  ];
  for (const text of texts) steps.append(element('li','',text));
  document.querySelector('.extension-path-label').hidden = Boolean(browser.storeUrl);
  document.querySelector('.extension-path-row').hidden = Boolean(browser.storeUrl);
  $('#automatic-setup-copy').textContent = browser.storeUrl ? 'Downloaderr prepares its connector automatically. Your browser asks you to confirm adding the published extension.' : browser.name === 'Firefox' ? 'Firefox requires a signed add-on for permanent installation. Until the add-on is published, Firefox asks you to load the included extension again after restarting the browser.' : 'Use the included extension folder for this browser.';
}
async function runBrowserSetup(action, browserName = selectedBrowserName) {
  const error = $('#browser-setup-error'); error.hidden = true;
  try {
    if (!browserName) throw new Error('Choose a browser first.');
    if (action === 'prepare') {
      const prepared = await call('browserSetup',{action:'prepare',browser:browserName});
      if (prepared?.extensionPath) $('#extension-path').value = prepared.extensionPath;
      await call('browserSetup',{action:'open',browser:browserName});
    } else await call('browserSetup',{action,browser:browserName});
    if (action === 'copy') notify('Extension folder path copied.');
  } catch (problem) { error.textContent = messageOf(problem); error.hidden = false; }
}
$('#browser-back').addEventListener('click',()=>{selectedBrowserName=null;$('#browser-detail').hidden=true;$('#browser-grid').hidden=false;});
$('#browser-refresh').addEventListener('click',()=>refreshIntegrationInfo(true));
$('#browser-primary-action').addEventListener('click',event=>runBrowserSetup(event.currentTarget.dataset.action,event.currentTarget.dataset.browser));
$('#copy-extension-path').addEventListener('click',()=>runBrowserSetup('copy'));
$('#show-extension-folder').addEventListener('click',()=>runBrowserSetup('folder'));
async function refreshIntegrationInfo(showErrors = false) {
  if (setupPolling) return; setupPolling = true;
  try { const info = await call('integration') || state.integration; state.integration = info; renderBrowserGrid(info); }
  catch (problem) { if (showErrors) { $('#browser-setup-error').textContent=messageOf(problem);$('#browser-setup-error').hidden=false; } }
  finally { setupPolling = false; }
}
const setupPoll = setInterval(()=>{if(integrationMode)refreshIntegrationInfo();},3000);
window.addEventListener('beforeunload',()=>clearInterval(setupPoll));
const completionActions=element('div','transfer-buttons');completionActions.id='download-complete-actions';completionActions.hidden=true;
for(const [label,action] of [['Open','open'],['Open with…','openWith'],['Open folder','reveal'],['Close','close']]){const button=element('button','button',label);button.type='button';button.addEventListener('click',()=>action==='close'?$('#details-dialog').close():performAction(detailDownload(),action));completionActions.append(button);}
const completedPanel=element('section','completed-panel');
const completedSummary=element('div','completed-summary');
completedPanel.append(completedSummary);
const completedFields={};
for(const [key,label] of [['url','Link'],['path','Saved to']]){
  const fieldLabel=element('label','completed-field',label),input=element('input');
  input.readOnly=true; input.setAttribute('aria-label',label);fieldLabel.append(input);completedPanel.append(fieldLabel);completedFields[key]=input;
}
completedPanel.append(completionActions);
const suppressLabel=element('label','checkbox-label'),suppressCompletion=element('input');suppressCompletion.type='checkbox';
suppressLabel.append(suppressCompletion,document.createTextNode("Don't show this dialog again"));completedPanel.append(suppressLabel);
suppressCompletion.addEventListener('change',async()=>{try{await call('settings',{hideCompletionDialog:suppressCompletion.checked});}catch(error){suppressCompletion.checked=!suppressCompletion.checked;notify(messageOf(error),true);}});
$('#details-dialog').append(completedPanel);
const renderTransferDetails=renderDetails;
renderDetails=function(){
  renderTransferDetails();const d=detailDownload();if(!d||statusOf(d)!=='completed')return;
  const badge=element('span','completed-icon'),check=element('span','completed-check'),copy=element('div','completed-copy'),name=element('span','completed-name',d.filename||'');
  check.append(iconSvg('check'));badge.append(fileIcon(d),check);name.title=d.filename||'';
  copy.append(element('strong','','Download complete'),name,element('span','completed-size',`Downloaded ${bytes(d.total||d.downloaded)} (${Math.round(d.total||d.downloaded||0).toLocaleString()} Bytes)`));
  completedSummary.replaceChildren(badge,copy);
  completedFields.url.value=d.url||'';completedFields.path.value=d.path||'';
  suppressCompletion.checked=state.settings.hideCompletionDialog===true;
};
function numeric(value) { const result = Number(value); return Number.isFinite(result) && result > 0 ? result : 0; }
function statusOf(d) { const value = String(d.status || 'queued').toLowerCase(); return ({active:'downloading',running:'downloading',probing:'connecting',complete:'completed',done:'completed',error:'failed',canceled:'cancelled',pending:'queued'})[value] || value; }
function categoryOf(d) { const value = String(d.category || '').toLowerCase(); if (/video/.test(value)) return 'Video'; if (/audio|music/.test(value)) return 'Audio'; if (/doc|text/.test(value)) return 'Documents'; if (/arch|compress/.test(value)) return 'Archives'; if (/program/.test(value)) return 'Programs'; return 'Other'; }
function bytes(value) { const size = numeric(value); if (!size) return '0 B'; const power = Math.min(4,Math.floor(Math.log(size) / Math.log(1024))); return `${(size / 1024 ** power).toFixed(power ? 2 : 0)} ${['B','KB','MB','GB','TB'][power]}`; }
function date(value) { if (!value) return ''; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString([],{dateStyle:'short',timeStyle:'short'}); }
function timeLeft(d) { const total=numeric(d.total)||numeric(d.streamProgress?.estimatedBytes); if (!total || !numeric(d.speed)) return ''; const seconds=Math.max(0,Math.ceil((total-numeric(d.downloaded))/numeric(d.speed))); return ((!d.total||d.estimated)?'≈ ':'')+duration(seconds); }
function sizeLabel(d) { return numeric(d.total)?(d.estimated?'≈ ':'')+bytes(d.total):d.streamProgress?.estimatedBytes?'≈ '+bytes(d.streamProgress.estimatedBytes):d.kind==='hls'?'Calculating from segments…':'Not supplied by server'; }
function duration(seconds) { return seconds < 60 ? `${Math.ceil(seconds)} sec` : seconds < 3600 ? `${Math.ceil(seconds / 60)} min` : `${Math.floor(seconds / 3600)} hr ${Math.floor(seconds % 3600 / 60)} min`; }
function percentage(d) { return statusOf(d) === 'completed' ? 100 : numeric(d.total) ? Math.min(100,numeric(d.downloaded) / numeric(d.total) * 100) : d.streamProgress?.total ? d.streamProgress.completed/d.streamProgress.total*100 : null; }
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; } }
function messageOf(error) { return error?.message || String(error || 'The operation failed.'); }
function notify(message,error = false) { clearTimeout(toastTimer); $('#toast-text').textContent = message; $('#toast').dataset.error = String(error); $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; },error ? 14000 : 7000); }
async function call(method,...args) { if (!api || typeof api[method] !== 'function') throw new Error('The download service is unavailable. Restart Downloaderr.'); const result = await api[method](...args); if (result?.error && !result.downloads) throw new Error(typeof result.error === 'string' ? result.error : result.error.message || 'The request failed.'); return result; }
function acceptSnapshot(snapshot) { if (!snapshot || !Array.isArray(snapshot.downloads)) return; state = {downloads:snapshot.downloads,settings:snapshot.settings || state.settings,integration:snapshot.integration || state.integration,fileIcons:snapshot.fileIcons || state.fileIcons,update:snapshot.update || null,version:snapshot.version || state.version}; const valid=new Set(state.downloads.map(d=>d.id)); for(const id of selectedIds)if(!valid.has(id))selectedIds.delete(id); if (!valid.has(selectedId)) selectedId = selectedIds.values().next().value || null; if (!valid.has(selectionAnchorId)) selectionAnchorId = selectedId; $('#download-list').setAttribute('aria-busy','false'); $('#connection-label').textContent = 'Connected'; $('#connection-label').className = 'connection-label online'; render(); if (!$$('dialog[open]').length) { const review = progressMode && state.downloads.find(d => d.id === progressMode && d.needsReview && !dismissedReviews.has(d.id)); if (review) openReview(review.id); } }
async function refresh() { acceptSnapshot(await call('snapshot')); }
function selected() { return state.downloads.find(d => d.id === selectedId); }
function canResume(d) { return d && !d.needsReview && ['paused','queued','scheduled','failed','cancelled'].includes(statusOf(d)); }
function canPause(d) { return d && !d.needsReview && ['downloading','connecting','queued','scheduled','assembling'].includes(statusOf(d)); }
function matches(d) { const status = statusOf(d); if (filter === 'completed' && status !== 'completed') return false; if (filter === 'unfinished' && status === 'completed') return false; if (filter === 'queued' && !['queued','scheduled','paused'].includes(status)) return false; if (category && categoryOf(d) !== category) return false; return !searchTerm || `${d.filename || ''} ${d.url || ''}`.toLowerCase().includes(searchTerm); }
function paintSelection() { $$('.download-row').forEach(row => { const active=selectedIds.has(row.dataset.id); row.classList.toggle('selected',active); row.setAttribute('aria-selected',String(active)); }); updateControls(); }
function selectDownload(id,{additive=false,toggle=false,range=false}={}) {
  if (!id) { selectedIds.clear(); selectedId = null; selectionAnchorId = null; paintSelection(); return; }
  if (range) {
    const targetIndex=visibleDownloads.findIndex(download=>download.id===id);
    let anchorIndex=visibleDownloads.findIndex(download=>download.id===selectionAnchorId);
    if(anchorIndex<0)anchorIndex=visibleDownloads.findIndex(download=>download.id===selectedId);
    if(anchorIndex<0)anchorIndex=targetIndex;
    if(!additive)selectedIds.clear();
    const start=Math.min(anchorIndex,targetIndex),end=Math.max(anchorIndex,targetIndex);
    for(let index=start;index<=end;index++)if(visibleDownloads[index])selectedIds.add(visibleDownloads[index].id);
    if(!selectionAnchorId)selectionAnchorId=visibleDownloads[anchorIndex]?.id||id;
  } else {
    if(!additive)selectedIds.clear();
    if(toggle&&selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);
    selectionAnchorId=id;
  }
  selectedId=selectedIds.has(id)?id:(selectedIds.values().next().value||null);
  paintSelection();
}
function rowFor(d) { const status = statusOf(d), percent = percentage(d); const row = element('tr','download-row'); row.dataset.id = d.id; row.dataset.status = status; row.classList.toggle('selected',selectedIds.has(d.id)); row.setAttribute('aria-selected',String(selectedIds.has(d.id))); const nameCell = element('td'); nameCell.title = d.filename || d.url; const name = element('span','file-name'); name.append(fileIcon(d));const text = element('span','file-text'); text.append(element('span','file-title',d.filename || 'Preparing file…'),element('span','file-host',hostOf(d.url))); name.append(text); nameCell.append(name); const names = {completed:'Complete',downloading:percent === null ? 'Receiving data…' : `${percent.toFixed(2)}%`,connecting:'Connecting…',assembling:'Finalizing…',queued:'Queued',scheduled:'Scheduled',paused:'Paused',cancelled:'Cancelled',failed:'Failed'}; const statusCell = element('td',`row-status ${status}`); statusCell.append(element('span','status-pill',names[status] || status)); if (['downloading','connecting'].includes(status)) { const bar = element('progress','mini-progress'); bar.max = 100; if (percent === null) bar.removeAttribute('value'); else bar.value = percent; bar.setAttribute('aria-hidden','true'); statusCell.append(bar); } statusCell.title = d.error || names[status] || status; const description = d.description || d.error || d.notice || (d.scheduledAt && status === 'scheduled' ? `Starts ${date(d.scheduledAt)}` : ''); const descriptionCell = element('td','',description); descriptionCell.title = description; row.append(nameCell,element('td','',['queued','scheduled','paused'].includes(status) ? '✓' : ''),element('td','',sizeLabel(d)),statusCell,element('td','',status === 'downloading' ? timeLeft(d) : ''),element('td','',status === 'downloading' ? `${bytes(d.speed)}/sec` : ''),element('td','',date(d.lastTry || d.createdAt)),descriptionCell); row.addEventListener('click',event => {if(suppressRowClick)return;const additive=event.ctrlKey||event.metaKey;selectDownload(d.id,{additive,range:event.shiftKey,toggle:additive&&!event.shiftKey});}); row.addEventListener('dblclick',() => showDetails(d.id)); row.addEventListener('contextmenu',event => { event.preventDefault(); selectDownload(d.id); showDetails(d.id); }); return row; }
function updateControls() { const d = selected(), busy = d && pending.has(d.id); $('#resume-selected').disabled = (!canResume(d) && !d?.needsReview) || busy; $('#stop-selected').disabled = !canPause(d) || busy; $('#remove-selected').disabled = !d || busy; $('#open-selected').disabled = !d || statusOf(d) !== 'completed'; $('#reveal-selected').disabled = !d; $('#details-selected').disabled = !d; $('#pause-all').disabled = !state.downloads.some(canPause); $('#stop-queue').disabled = $('#pause-all').disabled; $('#resume-all').disabled = !state.downloads.some(canResume); $('#remove-completed').disabled = !state.downloads.some(d => statusOf(d) === 'completed'); $('#scheduler-start').disabled = $('#resume-all').disabled; $('#scheduler-stop').disabled = $('#pause-all').disabled; }
function render() { visibleDownloads = state.downloads.filter(matches).sort((a,b) => { const result = sort === 'total' ? numeric(a.total) - numeric(b.total) : sort === 'createdAt' ? new Date(a.createdAt || 0) - new Date(b.createdAt || 0) : String(a[sort] || '').localeCompare(String(b[sort] || '')); return ascending ? result : -result; }); $('#download-list').replaceChildren(...visibleDownloads.map(rowFor)); $('#empty-state').hidden = visibleDownloads.length > 0; $('#empty-message').textContent = searchTerm ? 'No downloads match your search' : state.downloads.length ? 'Nothing here yet' : 'No downloads yet'; const complete = state.downloads.filter(d => statusOf(d) === 'completed').length; $('#list-count').textContent = `${visibleDownloads.length} ${visibleDownloads.length === 1 ? 'download' : 'downloads'}${state.downloads.length !== visibleDownloads.length ? ` of ${state.downloads.length}` : ''} (${complete} completed)`; $('#status-summary').textContent = `${bytes(state.downloads.reduce((sum,d) => sum + numeric(d.speed),0))}/sec`; const counts = {all:state.downloads.length,unfinished:state.downloads.filter(d=>statusOf(d)!=='completed').length,completed:complete,queued:state.downloads.filter(d=>['queued','scheduled','paused'].includes(statusOf(d))).length}; for (const [key,value] of Object.entries(counts)) $(`#count-${key}`).textContent = value ? String(value) : ''; const integrationButton=$('#integration-button'),needsBrowser=Boolean(state.integration?.packaged)&&!(state.integration?.connectedBrowsers?.length); integrationButton.classList.toggle('needs-attention',needsBrowser); integrationButton.title=needsBrowser?'No browser is connected yet. Click to set it up.':'Browser extension'; integrationButton.setAttribute('aria-label',integrationButton.title); renderUpdate(); updateControls(); if ($('#details-dialog').open) renderDetails(); if ($('#scheduler-dialog').open) renderScheduler(); }
// Sidebar card: shows download progress of a new version, then the "Update now" button.
function renderUpdate() {
  const update = state.update, card = $('#update-card'); if (!card) return;
  const visible = update && ['downloading','ready','available'].includes(update.state); card.hidden = !visible; if (!visible) return;
  // "available" = a Mac build that cannot install itself; the button opens the download page.
  const ready = update.state === 'ready', available = update.state === 'available';
  card.classList.toggle('ready',ready || available);
  $('#update-title').textContent = ready ? 'Update ready' : available ? 'New version' : 'Downloading update';
  $('#update-text').textContent = ready ? `Version ${update.version} is ready to install.` : available ? `Version ${update.version} is out.` : `Version ${update.version || ''} · ${update.percent || 0}%`;
  $('#update-progress').hidden = ready || available; $('#update-progress').value = update.percent || 0;
  $('#update-button').hidden = !(ready || available); if (!$('#update-button').disabled) $('#update-button').textContent = available ? 'Download' : 'Update now';
}
$('#update-button').addEventListener('click',async()=>{ const button=$('#update-button'); const opensPage = state.update?.state === 'available'; button.disabled=true; if (!opensPage) button.textContent='Restarting…'; try { const started = await call('installUpdate'); if (started === false || opensPage) { button.disabled=false; renderUpdate(); } } catch (error) { button.disabled=false; button.textContent='Update now'; notify(messageOf(error),true); } });
async function performAction(d,action) { if (!d || pending.has(d.id)) return; if (action === 'remove' && !window.confirm(`Delete “${d.filename || 'this download'}” from the download list?\n\nThe downloaded file will remain on your PC.`)) return; pending.add(d.id); updateControls(); try { await call('action',{id:d.id,action}); await refresh(); } catch (error) { notify(messageOf(error),true); } finally { pending.delete(d.id); updateControls(); if ($('#details-dialog').open) renderDetails(); } }
async function bulkAction(action) { const downloads = state.downloads.filter(action === 'pause' ? canPause : canResume); const results = await Promise.allSettled(downloads.map(d => call('action',{id:d.id,action:action === 'resume' && ['failed','cancelled'].includes(statusOf(d)) ? 'retry' : action}))); const failures = results.filter(r => r.status === 'rejected'); if (failures.length) notify(`${failures.length} operation(s) failed: ${messageOf(failures[0].reason)}`,true); try { await refresh(); } catch (error) { notify(messageOf(error),true); } }
async function removeCompleted() { const downloads = state.downloads.filter(d => statusOf(d) === 'completed'); if (!downloads.length || !window.confirm(`Delete ${downloads.length} completed download(s) from the list?\n\nThe downloaded files will remain on your PC.`)) return; const results = await Promise.allSettled(downloads.map(d => call('action',{id:d.id,action:'remove'}))); const failures = results.filter(r => r.status === 'rejected'); if (failures.length) notify(messageOf(failures[0].reason),true); try { await refresh(); } catch (error) { notify(messageOf(error),true); } }
function showDialog(id) { const dialog = $(id); if (!dialog.open) dialog.showModal(); }
function openAdd(text = '',scheduled = '') { if(!addMode&&!progressMode){call('openAdd',{scheduled}).catch(error=>notify(messageOf(error),true));return;} $('#add-hero-title').textContent = scheduled ? 'Schedule a download' : 'New download'; $('#add-hero-text').textContent = scheduled ? 'Pick a start time; Downloaderr starts it while running.' : 'Paste a link, choose where to save it, and start.'; $('#add-hero-icon').replaceChildren(iconSvg(scheduled ? 'clock' : 'add')); $('#add-hero-icon').className = 'form-hero-icon'; pendingReviewId = null; $('#add-error').hidden = true; $('#download-urls').value = text; $('#download-urls').readOnly = false; $('#download-filename').value = ''; $('#download-description').value = ''; $('#download-category').value = ''; rememberInput.checked = false; rememberInput.disabled = true; $('#download-schedule').value = scheduled; $('#add-directory').value = state.settings.defaultDirectory || ''; showDialog('#add-dialog'); $('#download-urls').focus(); }
async function openAddFromClipboard(){if(!addMode&&!progressMode){await call('openAdd',{paste:true});return;}openAdd(await call('clipboard'));}
function openReview(id) { if(!progressMode){call('openProgress',{id}).catch(e=>notify(messageOf(e),true));return;} document.body.classList.add('review-window'); document.title='Confirm download'; const d = state.downloads.find(item => item.id === id && item.needsReview); if (!d || dismissedReviews.has(id)) return; openAdd(d.url || ''); pendingReviewId = id; $('#download-urls').readOnly = true; $('#download-filename').value = d.filename || ''; $('#download-description').value = d.description || ''; $('#download-category').value = d.category || ''; rememberInput.disabled = !$('#download-category').value; $('#add-directory').value = d.directory || state.settings.defaultDirectory || ''; $('#add-hero-title').textContent = 'Confirm download'; $('#add-hero-text').textContent = [hostOf(d.url),numeric(d.total) ? sizeLabel(d) : ''].filter(Boolean).join(' · ') || 'Check the details, then start.'; $('#add-hero-icon').replaceChildren(fileIcon(d)); $('#add-hero-icon').className = 'form-hero-icon has-file'; }
async function dismissReview() { if (!pendingReviewId) return; const id = pendingReviewId; dismissedReviews.add(id); pendingReviewId = null; try { await call('action',{id,action:'remove'}); await refresh(); if(progressMode)await call('closeProgress'); } catch (error) { notify(messageOf(error),true); } }
function showDetails(id) { if (state.downloads.find(d => d.id === id)?.needsReview) { openReview(id); return; } if(!progressMode){call('openProgress',{id}).catch(e=>notify(messageOf(e),true));return;} document.body.classList.remove('review-window'); detailId = id; $('#detail-speed-limit').value = state.settings.speedLimitKbps || 0; $('#notify-complete').checked = state.settings.notifyOnComplete !== false; $('#reveal-complete').checked = state.settings.revealOnComplete === true; $('#completion-result').textContent = ''; setDetailTab('status'); renderDetails(); showDialog('#details-dialog'); }
function statTile(icon,label,value,sub) { const tile = element('div','stat-tile'), term = element('dt'), detail = element('dd','',value); term.append(iconSvg(icon),element('span','',label)); detail.title = value; detail.classList.toggle('long',value.length > 14); if (sub) detail.append(element('small','',sub)); tile.append(term,detail); return tile; }
function renderDetails() { const d = state.downloads.find(d => d.id === detailId); if (!d) { $('#details-dialog').close(); return; } const status = statusOf(d), percent = percentage(d), content = $('#details-content'), dialog = $('#details-dialog'); $('#details-title').textContent = `${percent !== null ? `${Math.floor(percent)}% ` : ''}${d.filename || 'Download status'}`; dialog.dataset.status = status; $('#detail-file-name').textContent = d.filename || 'Preparing file…'; $('#detail-file-name').title = d.filename || ''; const iconKey = `${extensionOf(d)}|${categoryOf(d)}|${Boolean(state.fileIcons?.[extensionOf(d)])}`; if ($('#detail-file-icon').dataset.key !== iconKey) { $('#detail-file-icon').dataset.key = iconKey; $('#detail-file-icon').replaceChildren(fileIcon(d)); } $('#transfer-source').textContent = String(d.url || '').replace(/^https?:\/\//,''); $('#transfer-source').title = d.url || ''; const names = {completed:'Complete',downloading:'Receiving data…',connecting:'Connecting…',paused:'Paused',queued:'Queued',scheduled:'Scheduled',failed:'Failed',cancelled:'Cancelled',assembling:'Finalizing…'}; $('#detail-status').textContent = names[status] || status; const resume = d.resumable === true ? 'Yes' : d.resumable === false ? 'No' : 'Checking…', badge = $('#detail-resume-badge'); badge.textContent = d.resumable === true ? 'Resumable' : d.resumable === false ? 'Not resumable' : 'Checking resume…'; badge.dataset.resumable = resume === 'Yes' ? 'yes' : resume === 'No' ? 'no' : 'unknown'; badge.title = `Resume capability: ${resume}`; const percentNode = $('#detail-percent'); percentNode.replaceChildren(); if (percent !== null) percentNode.append(String(Math.floor(percent)),element('small','','%')); content.replaceChildren(statTile('speed','Speed',status === 'downloading' ? `${bytes(d.speed)}/sec` : '0 B/sec'),statTile('clock','Time left',status === 'downloading' ? timeLeft(d) || 'Estimating…' : '—'),statTile('all','Downloaded',bytes(d.downloaded),percent !== null ? `${percent.toFixed(2)}%` : ''),statTile('size','File size',sizeLabel(d))); const extras = []; if (numeric(d.duration)) extras.push(['Video duration',`${Math.floor(d.duration/60)} min ${Math.floor(d.duration%60)} sec`]); if(d.streamProgress?.total&&status!=='completed')extras.push(['Segments',`${d.streamProgress.completed} / ${d.streamProgress.total}`]); if (d.scheduledAt && status === 'scheduled') extras.push(['Start at',date(d.scheduledAt)]); if (d.notice) extras.push(['Note',d.notice]); for (const [label,value] of extras) { const extra = element('div','stat-extra'); extra.append(element('dt','',label),element('dd','',value)); extra.title = value; content.append(extra); } const progress = $('#detail-progress'); if (percent === null && ['downloading','connecting'].includes(status)) progress.removeAttribute('value'); else progress.value = percent || 0; const segments = Array.isArray(d.connectionsProgress) ? d.connectionsProgress : []; const bars = $('#segment-bars'), map = $('#segment-map'); bars.replaceChildren(); map.replaceChildren(); for (let index = 0; index < segments.length; index++) { const segment = segments[index], total = numeric(segment.total), done = segment.status === 'complete' || segment.status === 'completed'; const segmentStatus = done ? 'Completed.' : segment.status || (status === 'downloading' ? 'Receiving data…' : names[status] || status); const share = total ? Math.min(100,numeric(segment.downloaded) / total * 100) : 0; const row = element('tr','connection-row'), meter = element('progress','connection-meter'), meterCell = element('td','connection-bar'); row.classList.toggle('done',done); meter.max = 100; meter.value = share; meter.setAttribute('aria-label',`Connection ${index + 1} progress`); if (!total && status === 'downloading') meter.removeAttribute('value'); meterCell.append(meter); row.title = total ? `Connection ${index + 1}: ${bytes(segment.downloaded)} of ${bytes(total)}` : `Connection ${index + 1}`; row.append(element('td','connection-index',String(index + 1)),meterCell,element('td','connection-bytes',bytes(segment.downloaded)),element('td','connection-info',segmentStatus)); bars.append(row); const bar = element('progress'); bar.max = 100; bar.value = share; bar.style.flexGrow = String(total || 1); if (!total && status === 'downloading') bar.removeAttribute('value'); map.append(bar); } $('#segment-note').textContent = segments.length ? `${segments.length} ${segments.length === 1 ? 'connection' : 'connections'}` : status === 'completed' ? 'Download completed.' : 'Connection progress appears when the transfer starts.'; $('#detail-error').textContent = d.error || ''; $('#detail-error').hidden = !d.error; $('#detail-open').disabled = status !== 'completed'; $('#detail-resume').disabled = !canResume(d) || pending.has(d.id); $('#detail-stop').disabled = !canPause(d) || pending.has(d.id); $('#detail-cancel').disabled = ['completed','cancelled'].includes(status) || pending.has(d.id); $('.transfer-buttons').hidden=status==='completed'; $('#download-complete-actions').hidden=status!=='completed'; dialog.classList.toggle('is-complete',status==='completed'); }
function setDetailTab(name) { for (const tab of ['status','speed','completion']) { const active = tab === name; $(`#tab-${tab}`).classList.toggle('active-tab',active); $(`#tab-${tab}`).setAttribute('aria-selected',String(active)); $(`#${tab}-panel`).hidden = !active; } }
function setView(nextFilter,nextCategory = '') { filter = nextFilter; category = nextCategory; $$('[data-filter],[data-category]').forEach(button => { const active = nextCategory ? button.dataset.category === nextCategory : button.dataset.filter === nextFilter; button.classList.toggle('selected',active); if (active) { button.setAttribute('aria-current','page'); $('#view-title').textContent = button.querySelector('span')?.textContent || 'All downloads'; } else button.removeAttribute('aria-current'); }); render(); }
function openSettings() { if(!optionsMode){call('openOptions').catch(error=>notify(messageOf(error),true));return;} const settings = state.settings; $('#start-with-windows').checked = settings.startWithWindows !== false; $('#default-directory').value = settings.defaultDirectory || ''; $('#max-concurrent').value = settings.maxConcurrent || 3; $('#connections').value = settings.connections || 8; $('#speed-limit').value = settings.speedLimitKbps || 0; $('#settings-error').hidden = true; showDialog('#settings-dialog'); }
function renderScheduler() { const downloads = state.downloads.filter(d => statusOf(d) === 'scheduled').sort((a,b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)); const list = $('#scheduled-list'); list.replaceChildren(); if (!downloads.length) list.append(element('p','field-help','No scheduled downloads.')); for (const d of downloads) { const row = element('div','scheduled-item'); const name = element('span','scheduled-name',d.filename), when = element('time','',date(d.scheduledAt)); name.title = d.filename; when.prepend(iconSvg('clock')); row.append(fileIcon(d),name,when); list.append(row); } }
function openScheduler() { if(!schedulerMode){call('openScheduler').catch(error=>notify(messageOf(error),true));return;} renderScheduler(); showDialog('#scheduler-dialog'); }
async function openIntegration() { try { await call('openIntegration'); } catch (error) { notify(messageOf(error),true); } }
const commands = {add:() => openAdd(),paste:async () => { try { await openAddFromClipboard(); } catch (error) { notify(messageOf(error),true); } },find:() => $('#search').focus(),settings:openSettings,integration:openIntegration,scheduler:openScheduler,pauseAll:() => bulkAction('pause'),resumeAll:() => bulkAction('resume'),removeCompleted};
commands.find = () => { $('.list-search').classList.add('visible'); $('#search').focus(); };
commands.details = () => { if (selectedId) showDetails(selectedId); };
commands.remove = () => performAction(selected(),'remove');
commands.all = () => setView('all');
document.addEventListener('keydown', event => { if (event.ctrlKey && event.key.toLowerCase() === 'f') commands.find(); if (event.key === 'Escape') $('.list-search').classList.remove('visible'); });
$('#new-download').addEventListener('click',commands.add); $('#settings-button').addEventListener('click',openSettings); $('#integration-button').addEventListener('click',openIntegration); $('#scheduler-button').addEventListener('click',openScheduler); $('#pause-all').addEventListener('click',commands.pauseAll); $('#stop-queue').addEventListener('click',commands.pauseAll); $('#resume-all').addEventListener('click',commands.resumeAll); $('#remove-completed').addEventListener('click',removeCompleted);
$('#resume-selected').addEventListener('click',() => { const d = selected(); if (d?.needsReview) { openReview(d.id); return; } performAction(d,d && ['failed','cancelled'].includes(statusOf(d)) ? 'retry' : 'resume'); }); $('#stop-selected').addEventListener('click',() => performAction(selected(),'pause')); $('#remove-selected').addEventListener('click',() => performAction(selected(),'remove')); $('#open-selected').addEventListener('click',() => performAction(selected(),'open')); $('#reveal-selected').addEventListener('click',() => performAction(selected(),'reveal')); $('#details-selected').addEventListener('click',() => { if (selectedId) showDetails(selectedId); });
const detailDownload = () => state.downloads.find(d => d.id === detailId);
$('#detail-open').addEventListener('click',() => performAction(detailDownload(),'open')); $('#detail-folder').addEventListener('click',() => performAction(detailDownload(),'reveal')); $('#detail-stop').addEventListener('click',() => performAction(detailDownload(),'pause')); $('#detail-cancel').addEventListener('click',() => call('closeProgress').catch(error=>notify(messageOf(error),true))); $('#detail-resume').addEventListener('click',() => { const d = detailDownload(); performAction(d,d && ['failed','cancelled'].includes(statusOf(d)) ? 'retry' : 'resume'); });
$('#toggle-details').addEventListener('click',async() => { const details = $('#connection-details'); details.hidden = !details.hidden; document.body.classList.toggle('details-collapsed',details.hidden); $('#toggle-details').textContent = details.hidden ? 'Show connections' : 'Hide connections'; if(progressMode)try{await call('resizeProgress',{expanded:!details.hidden});}catch(error){notify(messageOf(error),true);} });
for (const tab of ['status','speed','completion']) $(`#tab-${tab}`).addEventListener('click',() => setDetailTab(tab));
$('#detail-speed-form').addEventListener('submit',async event => { event.preventDefault(); $('#detail-speed-error').hidden = true; try { await call('settings',{speedLimitKbps:Number($('#detail-speed-limit').value)}); await refresh(); notify('Global speed limit saved.'); } catch (error) { $('#detail-speed-error').textContent = messageOf(error); $('#detail-speed-error').hidden = false; } });
$('#completion-form').addEventListener('submit',async event => { event.preventDefault(); try { await call('settings',{notifyOnComplete:$('#notify-complete').checked,revealOnComplete:$('#reveal-complete').checked}); await refresh(); $('#completion-result').textContent = ' Saved.'; } catch (error) { $('#completion-result').textContent = ` ${messageOf(error)}`; } });
$('#scheduler-start').addEventListener('click',commands.resumeAll); $('#scheduler-stop').addEventListener('click',commands.pauseAll); $('#schedule-new').addEventListener('click',() => { const future = new Date(Date.now() + 3600000),scheduled=new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0,16); if(schedulerMode)call('openAdd',{scheduled}).catch(error=>notify(messageOf(error),true));else{ $('#scheduler-dialog').close(); openAdd('',scheduled); } });
$('#more-button').addEventListener('click',() => call('showMenu').catch(error=>notify(messageOf(error),true)));
$$('[data-filter]').forEach(button => button.addEventListener('click',() => setView(button.dataset.filter))); $$('[data-category]').forEach(button => button.addEventListener('click',() => setView('all',button.dataset.category))); $$('[data-sort]').forEach(button => button.addEventListener('click',() => { const next = button.dataset.sort; ascending = sort === next ? !ascending : true; sort = next; render(); })); $('#search').addEventListener('input',event => { searchTerm = event.target.value.trim().toLowerCase(); render(); });
const categoryExpander=$('.tree-expander[aria-controls]');
function setCategoryTreeExpanded(expanded){const children=$(`#${categoryExpander.getAttribute('aria-controls')}`);children.hidden=!expanded;categoryExpander.setAttribute('aria-expanded',String(expanded));categoryExpander.setAttribute('aria-label',`${expanded?'Collapse':'Expand'} categories`);}
categoryExpander.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();setCategoryTreeExpanded(categoryExpander.getAttribute('aria-expanded')!=='true');});
categoryExpander.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();setCategoryTreeExpanded(categoryExpander.getAttribute('aria-expanded')!=='true');});
const tableScroll=$('#table-scroll'),selectionRectangle=$('#selection-rectangle');
const tablePoint=event=>{const bounds=tableScroll.getBoundingClientRect();return{x:event.clientX-bounds.left+tableScroll.scrollLeft,y:event.clientY-bounds.top+tableScroll.scrollTop};};
function initializeColumnResizing(){
  const table=$('.downloads-table'),columns=$$('.downloads-table col'),headers=$$('.downloads-table thead th');
  headers.forEach((header,index)=>{
    const handle=element('span','column-resizer');handle.setAttribute('aria-hidden','true');header.append(handle);
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const startX=event.clientX,startWidth=header.getBoundingClientRect().width,startTableWidth=table.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-columns');
      const move=moveEvent=>{const width=Math.max(index===1?20:45,startWidth+moveEvent.clientX-startX),delta=width-startWidth;columns[index].style.width=`${width}px`;table.style.width=`${Math.max(735,startTableWidth+delta)}px`;table.style.minWidth=table.style.width;};
      const finish=finishEvent=>{try{handle.releasePointerCapture(finishEvent.pointerId);}catch{}handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',finish);document.body.classList.remove('resizing-columns');};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    });
  });
}
initializeColumnResizing();
tableScroll.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('thead')||event.target.closest('button'))return;
  // A click synthesized for the pointer-up that ended a marquee is ignored.
  // A later, new pointer-down must always restore ordinary single-click use.
  suppressRowClick=false;
  tableScroll.focus({preventScroll:true});
  const point=tablePoint(event),row=event.target.closest('.download-row');
  const additive=event.ctrlKey||event.metaKey,range=event.shiftKey;
  selectionDrag={pointerId:event.pointerId,startX:point.x,startY:point.y,row,additive,range,base:(additive||range)?new Set(selectedIds):new Set(),moved:false};
  tableScroll.setPointerCapture(event.pointerId);
});
tableScroll.addEventListener('pointermove',event=>{
  if(!selectionDrag||selectionDrag.pointerId!==event.pointerId)return;
  const point=tablePoint(event),dx=point.x-selectionDrag.startX,dy=point.y-selectionDrag.startY;
  if(!selectionDrag.moved&&Math.hypot(dx,dy)<4)return;
  selectionDrag.moved=true;
  const left=Math.min(selectionDrag.startX,point.x),top=Math.min(selectionDrag.startY,point.y),right=Math.max(selectionDrag.startX,point.x),bottom=Math.max(selectionDrag.startY,point.y);
  Object.assign(selectionRectangle.style,{left:`${left}px`,top:`${top}px`,width:`${Math.max(1,right-left)}px`,height:`${Math.max(1,bottom-top)}px`});selectionRectangle.hidden=false;
  selectedIds.clear();for(const id of selectionDrag.base)selectedIds.add(id);
  const viewport=tableScroll.getBoundingClientRect();
  for(const row of $$('.download-row')){const rect=row.getBoundingClientRect(),rowLeft=rect.left-viewport.left+tableScroll.scrollLeft,rowTop=rect.top-viewport.top+tableScroll.scrollTop;if(rowLeft<right&&rowLeft+rect.width>left&&rowTop<bottom&&rowTop+rect.height>top)selectedIds.add(row.dataset.id);}
  selectedId=selectedIds.values().next().value||null;paintSelection();event.preventDefault();
});
function finishMarquee(event){if(!selectionDrag||selectionDrag.pointerId!==event.pointerId)return;const {moved,row,additive,range}=selectionDrag;try{tableScroll.releasePointerCapture(event.pointerId);}catch{}selectionDrag=null;selectionRectangle.hidden=true;if(moved){if(row)selectionAnchorId=row.dataset.id;}else if(row)selectDownload(row.dataset.id,{additive,range,toggle:additive&&!range});else selectDownload(null);suppressRowClick=true;setTimeout(()=>{suppressRowClick=false;},0);}
tableScroll.addEventListener('pointerup',finishMarquee);tableScroll.addEventListener('pointercancel',finishMarquee);
$('#table-scroll').addEventListener('keydown',event => { if (!visibleDownloads.length) return; const index = visibleDownloads.findIndex(d => d.id === selectedId); if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleDownloads.length - 1 : Math.max(0,Math.min(visibleDownloads.length - 1,index + (event.key === 'ArrowDown' ? 1 : -1))); selectDownload(visibleDownloads[next].id,{range:event.shiftKey}); $$('.download-row').find(row => row.dataset.id === selectedId)?.scrollIntoView({block:'nearest'}); } if (event.key === 'Enter' && selectedId) showDetails(selectedId); if (event.key === 'Delete') performAction(selected(),'remove'); });
$('#dismiss-toast').addEventListener('click',() => { $('#toast').hidden = true; }); $$('[data-close]').forEach(button => button.addEventListener('click',() => { const dialog = button.closest('dialog'); if(progressMode&&dialog.id==='add-dialog'||addMode&&dialog.id==='add-dialog'||optionsMode&&dialog.id==='settings-dialog'||schedulerMode&&dialog.id==='scheduler-dialog'){call('closeProgress').catch(error=>notify(messageOf(error),true));return;} dialog.close(); if (dialog.id === 'add-dialog') dismissReview(); })); $('#add-dialog').addEventListener('cancel',event => {if(progressMode||addMode){event.preventDefault();call('closeProgress').catch(error=>notify(messageOf(error),true));}else dismissReview();}); document.addEventListener('keydown',event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); if (!$$('dialog[open]').length) openAdd(); } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !$$('dialog[open]').length) { event.preventDefault(); $('#search').focus(); } });
$('#paste-button').addEventListener('click',async () => { try { $('#download-urls').value = await call('clipboard'); $('#download-urls').focus(); } catch (error) { $('#add-error').textContent = messageOf(error); $('#add-error').hidden = false; } }); $('#add-browse').addEventListener('click',async () => { try { const path = await call('chooseDirectory'); if (typeof path === 'string' && path) $('#add-directory').value = path; } catch (error) { $('#add-error').textContent = messageOf(error); $('#add-error').hidden = false; } });
$('#download-category').addEventListener('change',event => { const folder = state.settings.categoryDirectories?.[event.target.value]; if (folder) $('#add-directory').value = folder; rememberInput.disabled = !event.target.value; if (rememberInput.disabled) rememberInput.checked = false; });
$('#add-form').addEventListener('submit',async event => {
  event.preventDefault();
  const errorElement = $('#add-error'); errorElement.hidden = true;
  const urls = $('#download-urls').value.split(/\r?\n/).map(url => url.trim()).filter(Boolean);
  const filename = $('#download-filename').value.trim(), scheduled = $('#download-schedule').value;
  try {
    if (!urls.length) throw new Error('Enter at least one download address.');
    for (const url of urls) { let parsed; try { parsed = new URL(url); } catch { throw new Error(`Invalid address: ${url}`); } if (!['http:','https:'].includes(parsed.protocol)) throw new Error('Download addresses must begin with http:// or https://.'); }
    if (filename && urls.length !== 1) throw new Error('A custom file name can only be used for a single address.');
    const scheduledAt = scheduled ? new Date(scheduled).toISOString() : undefined;
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) throw new Error('Choose a future start time or leave Start at empty.');
    $('#add-submit').disabled = true; $('#add-later').disabled = true;
    const directory = $('#add-directory').value, selectedCategory = $('#download-category').value, description = $('#download-description').value.trim();
    if (rememberInput.checked && selectedCategory && directory) await call('settings',{categoryDirectories:{...state.settings.categoryDirectories,[selectedCategory]:directory}});
    const data = {...(filename ? {filename} : {}),...(scheduledAt ? {scheduledAt} : {}),...(directory ? {directory} : {}),...(selectedCategory ? {category:selectedCategory} : {}),description,queueOnly:event.submitter?.dataset.queueOnly === 'true'};
    const ids = pendingReviewId ? await call('review',{id:pendingReviewId,...data}) : await call('add',{urls,...data});
    pendingReviewId = null; if(!addMode)$('#add-dialog').close(); setView('all'); await refresh();
    if (!data.queueOnly && !scheduledAt && ids?.length === 1) { selectDownload(ids[0]); if(addMode)await call('openProgress',{id:ids[0]});else{showDetails(ids[0]);if(progressMode)await call('openProgress',{id:ids[0]});} } else if(progressMode) { await call('closeProgress'); }
    if(addMode)await call('closeProgress');
  } catch (error) { errorElement.textContent = messageOf(error); errorElement.hidden = false; }
  finally { $('#add-submit').disabled = false; $('#add-later').disabled = false; }
});
$('#choose-directory').addEventListener('click',async () => { try { const path = await call('chooseDirectory'); if (typeof path === 'string' && path) $('#default-directory').value = path; } catch (error) { $('#settings-error').textContent = messageOf(error); $('#settings-error').hidden = false; } }); $('#settings-form').addEventListener('submit',async event => { event.preventDefault(); const button = $('button[type=submit]',event.target); $('#settings-error').hidden = true; button.disabled = true; try { await call('settings',{startWithWindows:$('#start-with-windows').checked,defaultDirectory:$('#default-directory').value.trim(),maxConcurrent:Number($('#max-concurrent').value),connections:Number($('#connections').value),speedLimitKbps:Number($('#speed-limit').value)}); await refresh(); if(optionsMode)await call('closeProgress');else $('#settings-dialog').close(); } catch (error) { $('#settings-error').textContent = messageOf(error); $('#settings-error').hidden = false; } finally { button.disabled = false; } });
async function start() { try { await refresh(); if (typeof api.subscribe === 'function') unsubscribe = api.subscribe(snapshot => { if (snapshot?.downloads) acceptSnapshot(snapshot); else refresh().catch(error => notify(messageOf(error),true)); }); if (typeof api.onCommand === 'function') unsubscribeCommands = api.onCommand(async payload => { const command = typeof payload === 'string' ? payload : payload?.command; if (command === 'dismissBrowserIntegration') { if ($('#integration-dialog').open) $('#integration-dialog').close(); return; } if (command === 'reviewDownload') { try { await refresh(); if (!$$('dialog[open]').length) openReview(payload.id); } catch (error) { notify(messageOf(error),true); } return; } if (!$$('dialog[open]').length || ['pauseAll','resumeAll','removeCompleted'].includes(command)) commands[command]?.(); }); } catch (error) { $('#download-list').setAttribute('aria-busy','false'); $('#list-count').textContent = 'Download service unavailable'; $('#connection-label').textContent = 'Disconnected'; $('#connection-label').className = 'connection-label offline'; notify(messageOf(error),true); } }
window.addEventListener('beforeunload',() => { if (typeof unsubscribe === 'function') unsubscribe(); if (typeof unsubscribeCommands === 'function') unsubscribeCommands(); });
if(progressMode){
  $('#details-dialog').addEventListener('close',()=>call('closeProgress'));
  new MutationObserver(()=>{document.title=$('#details-title').textContent;}).observe($('#details-title'),{childList:true,characterData:true,subtree:true});
  // The initial snapshot decides between confirmation and transfer progress.
}
if(integrationMode)$('#integration-dialog').addEventListener('close',()=>call('closeProgress'));
if(optionsMode)$('#settings-dialog').addEventListener('close',()=>call('closeProgress'));
if(schedulerMode)$('#scheduler-dialog').addEventListener('cancel',event=>{event.preventDefault();call('closeProgress').catch(error=>notify(messageOf(error),true));});
start().then(async()=>{
  if(progressMode){showDetails(progressMode);return;}
  if(optionsMode){openSettings();return;}
  if(addMode){let text='';if(new URLSearchParams(location.search).get('paste')==='1')try{text=await call('clipboard');}catch(error){notify(messageOf(error),true);}openAdd(text,new URLSearchParams(location.search).get('scheduled')||'');return;}
  if(schedulerMode){openScheduler();return;}
  if(integrationMode){
    selectedBrowserName = null;
    $('#browser-detail').hidden = true;
    $('#browser-grid').hidden = false;
    $('#integration-dialog').show();
    await refreshIntegrationInfo(true);
    return;
  }
  if(state.integration.packaged && !state.integration.connectedBrowsers?.length && !localStorage.getItem('browser-setup-introduced') && !$$('dialog[open]').length){
    await openIntegration();
    localStorage.setItem('browser-setup-introduced','1');
  }
});
