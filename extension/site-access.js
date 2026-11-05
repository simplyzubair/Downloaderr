/* Per-site permission: Downloaderr acts only on websites the user allowed.
   Rules live in storage.local under "siteAccess" as { "example.com": "allow" | "block" }.
   A rule also covers subdomains (a rule for example.com applies to video.example.com). */
(function (root) {
  const KEY = 'siteAccess';
  const STATES = ['allow', 'block'];

  // The site of a page: its host name without "www.", or '' for non-web pages.
  function siteOf(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || !url.hostname) return '';
      return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    } catch { return ''; }
  }

  // "allow", "block", or "ask" when the user has not decided yet.
  function decide(rules, site) {
    if (!site || !rules || typeof rules !== 'object') return 'ask';
    const parts = site.split('.');
    // Check the site itself, then each parent domain, but never a bare top-level domain.
    for (let i = 0; i < Math.max(1, parts.length - 1); i++) {
      const value = Object.prototype.hasOwnProperty.call(rules, parts.slice(i).join('.')) ? rules[parts.slice(i).join('.')] : undefined;
      if (STATES.includes(value)) return value;
    }
    return 'ask';
  }

  // Returns a new rules object; "ask" removes the rule. Invalid input leaves rules unchanged.
  function withRule(rules, site, state) {
    const next = { ...(rules && typeof rules === 'object' ? rules : {}) };
    if (!site || site.length > 253 || !/^[a-z0-9.-]+$/.test(site)) return next;
    if (state === 'ask') delete next[site];
    else if (STATES.includes(state)) next[site] = state;
    return next;
  }

  const api = { KEY, siteOf, decide, withRule };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.siteAccess = api;
})(typeof globalThis === 'object' ? globalThis : this);
