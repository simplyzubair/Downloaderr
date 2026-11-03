# Downloaderr

<img src="assets/app-icon.png" alt="Downloaderr logo" width="96">

A modern Windows download manager with segmented transfers, a light and dark
interface, and browser video buttons. Not affiliated with Internet Download
Manager and not a complete feature-for-feature replacement.

Downloaderr is based on the MIT-licensed
[Awesome Downloader](https://github.com/Ahmadkhattak1/awesome-downloader) project.

**Early preview:** Private/sign-in-required, DRM and live media are unsupported. Please report bugs
without sharing session tokens or signed media links.

## Just want to use it?

Download it from **https://downloaderr.skillsgeek.com** (or **Downloaderr-Setup.exe** from the
[latest release](https://github.com/simplyzubair/Downloaderr/releases/latest)),
then see the [installation and usage guide](docs/INSTALL.md). It is a normal
Windows installer with Start-menu and
desktop shortcuts. No GitHub account, Node.js, or developer tools are needed for
the desktop app.

The installer is currently an unsigned preview. Browser video buttons require
one manual "Load unpacked" setup; browser-store listings are not available.

## Features

- HTTP(S) downloads with parallel ranges where the server supports them.
- Pause/resume for supported transfers, history, scheduling and speed limits.
- Chrome, Edge, Brave, and Opera media detection and quality selection; selected video/audio tracks
  are combined locally with FFmpeg.
- New download window with save location, category, Download later, Start and Cancel.
- Separate progress and completion windows, duplicate-active-download prevention.

YouTube uses captured browser-session data and the GoogleVideo SABR transport
library. It is not a promise of universal site support or DRM circumvention.
The legacy manual watch-URL resolver optionally uses yt-dlp; browser quality
selection does not invoke it. Firefox YouTube capture has not reached parity.

## Develop

On Windows x64 with Node.js 22+:

```powershell
npm ci
npm test
npm start
```

`npm run package` builds the unpacked application. `npm run dist` builds a local
NSIS installer, without publishing. `npm run dist:portable` builds a portable
executable. See [release requirements](docs/RELEASING.md) before distributing
either. Current builds are unsigned.

**Releases:** every push to `main` that changes the app builds and publishes
release `v0.2.<run number>` (`.github/workflows/release.yml`). Never tag by hand.
Installed apps check at startup and every hour, download the new version in the
background, and show **Update now** in the sidebar and tray menu. If the user
does not click it, the update installs when Downloaderr quits.

**Website:** `website/` is the download page at https://downloaderr.skillsgeek.com,
served by host nginx on Contabo from `/var/www/downloaderr`. Deploy changes with
`bash scripts/deploy-website.sh`.

The optional legacy extractor is described in [THIRD-PARTY.md](THIRD-PARTY.md).
Do not commit its executable. `npm ci` installs the locked media dependencies.

## Contribute

**New contributor? Start with the [contributor guide and roadmap](docs/CONTRIBUTOR-START-HERE.md).**
It explains the current project stage, issue labels, dependency order and how
to agree on a task before coding. Major goals are delivered through focused,
reviewed PRs; planned platform support is not yet released support.

Bug reports, tests, documentation and pull requests are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
You can fork the project and submit a pull request without repository write access.

High-priority work: YouTube throughput and session refresh, clean-machine
installer testing, browser-store packaging, and accessibility.

## Privacy and licensing

Media request credentials are held in memory, not stored in download history.
History and browser-integration configuration are stored locally in
`%USERPROFILE%\.awesome-downloader`. The bridge is authenticated and loopback-only.
Do not publish this directory or browser profiles in issues.

Original project code is [MIT licensed](LICENSE). Third-party components retain
their own licenses, including GPL-covered FFmpeg components; see
[THIRD-PARTY.md](THIRD-PARTY.md). Proprietary binaries, extracted evidence, local
research and test screenshots are not part of the public source.
Only download content you are permitted to save.
