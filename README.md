# Hex Cards 2.0

A League of Legends companion app: 1–3 data-driven builds per champion and role, a build recommendation based on the enemy team, and reliable import of runes, item sets and summoner spells into the League client.

**Download:** [latest Windows installer](https://github.com/omeaga1/hexcards-2/releases/latest) · **Site:** https://omeaga1.github.io/hexcards-2/

Run the `_x64-setup.exe`. It installs for your Windows user (no admin prompt) and updates itself when a new version is released. Windows may warn that the installer isn't code-signed; choose **More info → Run anyway**.

## Development

```bash
npm install
npm run app          # desktop app with hot reload (needs Rust and the MSVC build tools)
npm test             # engine tests
npm run typecheck
```

Releasing: `npm run version -- 0.2.0`, commit, then `git tag v0.2.0 && git push origin v0.2.0`. The Release workflow builds, signs and publishes the installer.

Data: the Data workflow collects ranked games every 6 hours and publishes builds to GitHub Pages. See [PLAN.md](PLAN.md) for how builds are made.
