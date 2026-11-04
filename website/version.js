// Shows the newest version and links each button to that version's file
// (file names carry the version, e.g. Downloaderr-Setup-0.2.11.exe).
// Without this script the buttons open the GitHub releases page instead.
fetch('https://api.github.com/repos/simplyzubair/Downloaderr/releases/latest')
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (!data?.tag_name) return;
    const version = data.tag_name.replace(/^v/, '');
    document.getElementById('version').textContent = `Latest version ${version}. Fast, modern downloads for Windows and Mac.`;
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const link = (id, test) => {
      const asset = assets.find((a) => test.test(a.name || ''));
      const url = asset?.browser_download_url || '';
      if (url.startsWith('https://github.com/simplyzubair/Downloaderr/releases/download/')) document.getElementById(id).href = url;
    };
    link('download-windows', /^Downloaderr-Setup(-[\d.]+)?\.exe$/);
    link('download-mac', /^Downloaderr(-[\d.]+)?-mac-arm64\.dmg$/);
  })
  .catch(() => {});
