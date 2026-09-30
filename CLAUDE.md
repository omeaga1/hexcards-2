# Hex Cards 2.0

League of Legends companion desktop app (Tauri 2 + React + TypeScript). Summoner's Rift only. Full plan: PLAN.md.

## Product rules

- Builds come from our own Riot Match-V5 pipeline (Emerald+, NA/EUW/KR, current patch), clustered into 1–3 variants per champion and role. Never fall back to hand-written template builds.
- The build recommendation is deterministic math from match data. No LLM computes it.
- Rune pages are stored and sent as perk IDs, validated against the client's `/lol-perks/v1/styles` before import. Only touch the rune page and item sets Hex Cards created; never modify the user's own pages or sets.
- Only show information the League client already shows the user.

## UI

- Components come from Arc UI (https://uiarc.dev, MIT), copied in as source. Build lanes and item forks are our own components on Arc tokens.
- Never hard-code a color, font or spacing value; use the CSS variables.
- Dark theme is the default.

## Hosting

- No Cloudflare. GitHub Actions runs the data pipeline, GitHub Pages serves build JSON, GitHub Releases serves the installer and auto-updates.
- The Riot API key lives only in GitHub Actions secrets and a local `.env`, never in the repo.

## Git

- Commit as the repo-local identity (omeaga1). Do not change the global git config.
