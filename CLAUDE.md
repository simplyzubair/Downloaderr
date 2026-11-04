# Downloaderr (repo simplyzubair/Downloaderr, public, default branch main)

- Windows download manager (Electron) + browser extension. Rebranded from the MIT project Awesome Downloader; keep its LICENSE copyright line.
- Internal IDs keep the old name on purpose (data folder `~/.awesome-downloader`, native host `com.awesome.downloader`, appId `com.awesomedownloader.desktop`, Firefox ID, NSIS registry keys). Renaming them breaks existing installs and the extension.
- Releases: every push to `main` (not `*.md`, `docs/`, `website/`, `deploy/`) builds `v0.2.<run>`; it publishes only after the owner approves the `release` environment on the run page via `.github/workflows/release.yml`. Installed apps download it in the background and show "Update now" (sidebar card + tray). Never hand-tag.
- Website: https://downloaderr.skillsgeek.com, `bash scripts/deploy-website.sh` (host nginx on `co`, `/var/www/downloaderr`, certbot HTTPS, Cloudflare DNS only).
- Before every push: `npm test` (122+ tests). For release-workflow changes, push a branch and `gh workflow run release.yml --ref <branch>` (builds without publishing); merge to `main` only when green.
- In this T3 shell `ELECTRON_RUN_AS_NODE=1` is set; unset it before launching Electron. Screenshot harness lives in `D:\Backups\rebrand-scripts\shot`.
