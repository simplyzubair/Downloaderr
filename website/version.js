// Shows the newest version number from GitHub. The download links work without this.
fetch('https://api.github.com/repos/simplyzubair/Downloaderr/releases/latest')
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (data?.tag_name) {
      document.getElementById('version').textContent = `Latest version ${data.tag_name.replace(/^v/, '')}. Fast, modern downloads for Windows and Mac.`;
    }
  })
  .catch(() => {});
