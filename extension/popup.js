/* Toolbar popup: Allow / Block / Ask for the current site, and the list of saved sites. */
(() => {
  const api = globalThis.browser || chrome;
  const $ = id => document.getElementById(id);
  const LABELS = { allow: 'Allowed', block: 'Blocked', ask: 'Asks first' };
  const HELP = {
    allow: 'Downloaderr takes over downloads and video buttons on this site.',
    block: 'Downloaderr stays off here. Chrome handles downloads.',
    ask: 'Downloaderr asks before doing anything on this site.'
  };
  let current = null;

  const send = message => api.runtime.sendMessage(message);

  function showSite(site, state) {
    $('site-card').hidden = !site;
    if (!site) return;
    $('site-name').textContent = site;
    $('site-state').textContent = LABELS[state] || LABELS.ask;
    $('site-state').className = `site-state ${state}`;
    $('site-help').textContent = HELP[state] || HELP.ask;
    for (const button of document.querySelectorAll('.site-actions button')) button.setAttribute('aria-pressed', String(button.dataset.state === state));
  }

  function showList(rules) {
    const list = $('sites-list');
    list.replaceChildren();
    const entries = Object.entries(rules || {}).filter(([, state]) => state === 'allow' || state === 'block').sort(([a], [b]) => a.localeCompare(b));
    $('sites-count').textContent = entries.length ? `(${entries.length})` : '';
    $('sites-empty').hidden = entries.length > 0;
    for (const [site, state] of entries) {
      const item = document.createElement('li');
      const name = document.createElement('span'); name.className = 'name'; name.textContent = site;
      const badge = document.createElement('span'); badge.className = `site-state ${state}`; badge.textContent = LABELS[state];
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = '×';
      remove.title = `Forget ${site} (ask again next time)`; remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => change(site, 'ask'));
      item.append(name, badge, remove); list.append(item);
    }
  }

  async function change(site, state) {
    const result = await send({ action: 'setSiteAccess', site, state });
    if (!result?.ok) return;
    await refresh();
    // Pages apply the new choice right away; a reload restores a blocked page's buttons.
    if (current && site === current.site && state !== 'block' && current.tabId !== undefined) api.tabs.reload(current.tabId).catch?.(() => {});
  }

  async function refresh() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const site = globalThis.siteAccess.siteOf(tab?.url || '');
    current = site ? { site, tabId: tab.id } : null;
    const status = site ? await send({ action: 'siteStatus', url: tab.url }) : null;
    showSite(site, status?.state || 'ask');
    const list = await send({ action: 'siteList' });
    showList(list?.rules);
  }

  for (const button of document.querySelectorAll('.site-actions button')) {
    button.addEventListener('click', () => { if (current) change(current.site, button.dataset.state); });
  }
  refresh().catch(() => {});
})();
