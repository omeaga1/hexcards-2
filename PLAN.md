# Hex Cards 2.0 — Plan

A League of Legends companion app in the same space as Blitz, Mobalytics and U.GG. It does three jobs well:

1. **Builds that keep up with the meta.** Each champion gets 1–3 real builds per role (for example "Bruiser", "Lethality", "AP"). They come from recent high-elo match data for the current patch, not hand-written templates.
2. **Picks the right build for this game.** It reads the enemy team in champ select, recommends one of the builds, and shows which situational swaps matter. You can always override the pick.
3. **Imports into the client correctly every time.** Runes, item sets and summoner spells go into the League client with no broken pages, no overwritten pages and no garbled item sets.

Itemization UI takes inspiration from Deadlock: named, annotated build sections and branching "if X, buy Y" forks, instead of a strict grid of cards.

We start from scratch. The original Hex Cards (`omeaga1/hexcards`) is reference only. Section 1 records what to learn from it.

---

## 1. What went wrong in Hex Cards 1.0

I read the original repo. The bugs you noticed have concrete causes:

### Rune import is unreliable
- **Runes are stored by name and mapped to IDs through a hand-written table** (`src/services/leagueExportService.ts`). Some entries are stale or wrong: `Absorb Life` and `Overheal` both map to `9101`, and `Ghost Poro` and `Eyeball Collection` are runes Riot has removed. **Unknown names fall back silently to default IDs from other trees** (`|| 9111`, `|| 8444`). The client then gets an invalid page, for example a Resolve rune inside a Domination secondary tree. It rejects the page or applies it half-broken.
- **Stat shards are guessed by matching substrings** in a display string ("includes 'Attack Speed'").
- **It overwrites your rune pages.** If no "HexCards" page exists, it takes the *first editable page you own*. It PUTs over that page, and if the PUT fails it DELETEs your page and recreates it.
- **Nothing is validated** before the page is sent: keystone in the primary tree, one rune per row, two secondaries from different rows, and so on.

### Item sets glitch
- The desktop path writes to `/lol-item-sets/v1/item-sets/{accountId}/sets`, but that endpoint is keyed by **summonerId**. The code tries `accountId` first.
- The browser-bridge path uses a **different endpoint and body shape** (`/lol-item-sets/v1/item-sets/{id}` with `{ itemSets: [set] }`). The same button behaves differently depending on how the app is running.
- It re-PUTs every existing set exactly as fetched and matches "our" set by title. There is no stable `uid`, so renaming a build creates duplicates.

### Client detection is flaky
- Detection reads the lockfile from four hard-coded paths, then falls back to `wmic`. **`wmic` no longer exists on your machine**; I checked and it's gone on Windows 11 24H2 and later. Anywhere League isn't in one of those four folders, detection fails.
- It **polls** the client every few seconds instead of subscribing to the client's WebSocket event stream, so champ select updates lag.
- It sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for the whole process and `webSecurity: false` on the window. That's much broader than needed.

### Builds are generic and stale
- `scripts/generateAllChampionBuilds.mjs` makes **one build per champion, for one role**. It **regex-parses text** from OP.GG's MCP endpoint. When a parse fails, it falls back to a **hard-coded archetype template**: every "Mage" gets Luden's → Shadowflame → Rabadon's. That's why builds feel generic.
- The data shows it. In the current `meta-builds-latest.json`, Jax is listed as Jungle with Lethal Tempo into Zhonya's, with Support as his secondary role. Old item names like "Luden's Echo" still appear.
- Runes and items are chosen separately. Nothing ties "this rune page" to "this item path", so the combinations can contradict each other.

### UI
- A 2,200-line `DeadlockItemDeck.tsx` plus scripts that rewrite that source file with string replacement (`scripts/updateDeadlockDeck.mjs`). No design tokens; colors are hard-coded.

**Worth keeping as ideas:** the "If/Then pivot" concept (buy anti-heal against healers), plain-English ability notes, the glossary, and Deadlock-style staging (Start → First back → Core → Late).

---

## 2. Desktop or web?

**Recommendation: a desktop app as the main product. Later, an optional website that reuses the same UI for browsing builds.**

Why desktop:
- The features you like most (auto-detect your champion, read the enemy team, import runes, items and spells) all go through the **League Client API (LCU)**. The LCU runs on `127.0.0.1` on a random port, with a password stored in a local lockfile and a self-signed certificate. A browser page can't read that lockfile, can't trust that certificate, and is blocked by CORS. The only way a website could do this is by making you install a local helper app, and at that point you already have a desktop app.
- The in-game **Live Client Data API** (port 2999) is also local-only. Later it lets us show "next item to buy" from your current gold and inventory.

**Framework: Tauri 2 (recommended) or Electron.**

| | Tauri 2 | Electron (what 1.0 used) |
|---|---|---|
| Installer size | ~10 MB | ~120 MB |
| RAM while League is running | ~60–100 MB (uses Windows' built-in WebView2) | ~250–400 MB (bundles its own Chromium) |
| UI code | React + TypeScript, same as now | React + TypeScript |
| Client connection code | Small Rust module | Node, which you're more familiar with |
| Auto-update | `tauri-plugin-updater` via GitHub Releases | `electron-updater` |

People run this app *next to a game*, so the memory savings matter. The Rust part stays small: find the lockfile, open the WebSocket, forward events, make a few requests. All the product logic stays in TypeScript. If you'd rather avoid Rust entirely, Electron works, and everything else in this plan stays the same.

The build data is served from the web either way (section 4), so a read-only website like u.gg.com costs little to add later.

---

## 3. Architecture

**No Cloudflare needed.** The only server-side work is a scheduled job that crawls matches and publishes build JSON files. GitHub gives a public repo both for free: **GitHub Actions** runs the job on a schedule, and **GitHub Pages** hosts the JSON. **GitHub Releases** already hosts the installer and auto-updates. Everything lives in one repo. Cloudflare is only an upgrade path if the crawl ever outgrows Actions.

```
┌────────────────────────── Desktop app (Tauri 2) ──────────────────────────┐
│  Rust core                         │  React + TS UI                      │
│  • find League (Riot metadata →    │  • Champ select board               │
│    lockfile), no wmic              │  • Build variants (1–3) + recommend │
│  • LCU WebSocket subscribe         │  • Deadlock-style build lanes       │
│  • typed LCU requests              │  • Compact overlay mode             │
│  • Live Client Data (in game)      │                                     │
│  • pinned Riot root cert           │  packages/engine (pure TS)          │
│                                    │  • recommend build from enemy comp  │
│                                    │  • rune page + item set builders    │
│                                    │    with validation                  │
└────────────────────────────────────┴──────────────────────────────────────┘
                       ▲ fetch builds/{patch}/{champ}.json (cached offline)
                       │
┌──────────────── Build data pipeline (GitHub Actions) ───────────────┐
│  Scheduled job → Riot Match-V5 API: crawl high-elo ranked matches   │
│  Per-patch game facts (compressed, stored as a Release asset)       │
│  → aggregation + clustering → GitHub Pages: builds per champ/role   │
└─────────────────────────────────────────────────────────────────────┘
```

Monorepo (npm workspaces):

```
apps/desktop      Tauri app (src-tauri/ in Rust, src/ in React)
apps/web          (later) read-only build browser on GitHub Pages
packages/data     zod schemas: Build, RunePage, ItemSet, EnemyComp; DDragon loaders
packages/engine   recommendation + import builders; pure functions, unit-tested
packages/ui       Arc UI components (copied in) + our own build-lane components
pipeline/         Node scripts run by GitHub Actions: crawler, aggregator, publisher
design/           Arc foundation tokens + Hex Cards overrides
```

---

## 4. The build system (the most important part)

### 4.1 Data source: our own, from Riot's API
Don't scrape OP.GG or U.GG. Scraping breaks whenever their pages change, it's against their terms, and you only get one build per champion. Instead:

- **Riot Match-V5 API** with a registered key from developer.riotgames.com. You need to register the app yourself; I can't do that for you. A *Personal* key doesn't expire, and it's enough to start. Apply for a *Production* key before a public release.
- Crawl **Summoner's Rift** ranked solo/duo games at **Emerald+** (configurable) from NA, EUW and KR. Summoner's Rift only for v1. Keep only the **current patch**, plus the previous one until the new patch has enough games.
- For each game, pull the match and its **timeline**. The timeline gives the real purchase order and skill level-up order.

### 4.2 What we store per player-game
Champion, role, patch, win/loss, the full rune page **as perk IDs**, summoner spells, skill order, starting items, the order completed items were bought, boots and timing, plus the enemy team's champions.

### 4.3 Getting 1–3 builds per champion (clustering)
1. Describe each game's build by its first 3 completed items, as a stat profile from Data Dragon: AD, AP, attack speed, crit, lethality, on-hit, health, armor/MR, ability haste.
2. Cluster each champion+role's games (k-medoids). Try k = 1..3, keep a cluster only if it has at least 8% of games, and pick k by silhouette score. The real-world splits come out naturally: Kai'Sa on-hit vs AP, Jax Trinity vs Sundered Sky, Ekko AP vs tank.
3. For each cluster, compute these **within that cluster only**, so runes and items always match:
   - most common core path (item 1 → 2 → 3) plus top 4th–6th item options
   - rune page (most common full page, validated)
   - skill max order, summoner spells, starting items, boots
   - pick share, win rate with a confidence interval, sample size
4. **Automatic labels** from the cluster's stat profile ("Bruiser", "Lethality", "Crit", "On-hit", "AP Burst", "Tank", "Enchanter"). You can override labels in a small `overrides.json` for odd cases.
5. Minimum sample rules: under N games for the patch, blend in last patch's data and mark the build "low sample". No template fallback, ever.

### 4.4 Situational items learned from data
For each item, compare how often it's bought, and its win rate, **when the enemy team has trait T** versus when it doesn't. Traits include heavy healing, 2+ tanks, AP burst, lots of CC, shields. Items with a significant lift become that build's **forks**, for example "vs 2+ tanks → swap core #3 for Lord Dominik's". This is 1.0's pivot idea, but learned from real games instead of hard-coded.

Enemy traits come from a champion trait table: Data Dragon tags, plus damage split and healing/CC/shield flags, maintained in `packages/data`.

### 4.5 Recommending a build in champ select
This is deterministic math with no LLM involved:
- For each build variant, estimate its win rate against the enemy comp using the per-trait win rates from the same data, shrunk toward the build's overall win rate when samples are small.
- Recommend the highest, and show **why** in one line ("Enemy has 3 AD threats and a Soraka → Bruiser build + Mortal Reminder fork").
- You can switch variants in one click. Import follows whatever is selected.

### 4.6 Running and publishing
- A GitHub Actions workflow runs on a schedule, up to 4 times a day. Each run can last up to 6 hours, and Actions minutes are free for public repos. At the Personal-key rate limit (100 requests per 2 minutes), that's roughly 30,000 matches a day with timelines, or about 300,000 player-games. That's plenty for a 2-week patch.
- The Riot key is stored as an Actions secret and never goes into the repo.
- Crawl state (per-patch game facts, compressed) is kept as a GitHub Release asset. Each run downloads it, appends new games and uploads it again.
- The pipeline writes `builds/{patch}/{championId}.json` plus a small `index.json` to GitHub Pages. The app caches it locally, so it still works offline. A new patch is detected from Data Dragon `versions.json`.

---

## 5. Client integration done right

**Finding the client.** Read `C:\ProgramData\Riot Games\Metadata\league_of_legends.live\league_of_legends.live.product_settings.yaml` to get the install folder, then read the `lockfile` there. On your machine that folder is `C:\Riot Games\League of Legends`. As a fallback, read the running `LeagueClientUx.exe` command line with `Get-CimInstance` (not `wmic`). Watch the lockfile, so the app connects when you launch League and reconnects after client restarts.

**Events, not polling.** Subscribe over the LCU WebSocket to:
- `/lol-gameflow/v1/gameflow-phase` (lobby → champ select → in game → end of game)
- `/lol-champ-select/v1/session` (your pick, your role, enemy picks as they lock in)

**TLS.** Pin Riot's published root certificate for `127.0.0.1` only. Don't turn off certificate checks globally.

**Rune import (strict):**
1. Build the page from **perk IDs** stored in the build data. No name lookups.
2. Validate it against the client's own `/lol-perks/v1/styles` for the current patch: keystone in the primary style, one rune per row, two secondaries from different rows of the sub-style, and three valid shards, one per shard slot. If validation fails, show an error and send nothing.
3. **Manage one page we own**, named "HexCards: <Champ> <Variant>". Remember its page ID. Update or recreate only that page. **Never touch your other pages.** If you're at the page limit, ask which page to replace.
4. Set it as the current page.

**Item set import:**
- Use `summonerId` from `/lol-summoner/v1/current-summoner` with `/lol-item-sets/v1/item-sets/{summonerId}/sets`.
- GET the existing sets, **keep every set we didn't create exactly as it is**, and replace only ours. Ours are identified by a stable `uid` prefix such as `hexcards-<champ>-<variant>`.
- Export **all 1–3 variants** as separate item sets, so you can switch in the in-game shop mid-game. Blocks: Start · First back · Core · Situational forks · Late.
- Map non-purchasable upgrades (Muramana, Seraph's, and so on) to what you actually buy.

**Summoner spells:** PATCH `/lol-champ-select/v1/session/my-selection` with the build's spells. Respect your Flash-on-D/F preference, which is a setting in the app.

**Automation settings:** auto-import on lock-in (on/off), auto-set spells (on/off), and which variant to use (recommended / always ask / last used).

**Test harness:** record real champ select event streams to JSON fixtures, then replay them against a mock LCU in tests. That lets us test the import logic without being in a game.

---

## 6. UI direction

**Component library: Arc UI** (https://uiarc.dev, MIT). The Fantasy Football app already uses it. Components are copied into the repo as source files (shadcn-style), not installed as a package, so we own and restyle them. We reuse the `arc-add` script pattern from that project. Arc also ships an agent skill (`arc-skill`) that we install into the repo, so Claude picks and composes Arc components correctly.

Theme: start from `arc-foundation` tokens, dark by default because the app sits next to the League client, with a Hex Cards accent. Don't copy Riot's gold-and-navy look. Never hard-code colors; use the tokens.

Which Arc components go where:

| Need | Arc component |
|---|---|
| Choose between the 1–3 builds | `radio-cards` (label, pick share, win rate, "Recommended" marker) |
| Champion search | `command-palette`, `combobox` |
| Item and rune details on hover | `hover-card`, `tooltip`, `popover` |
| Rune page / skills / spells views | `tabs`, `segmented-control` |
| Win rate, pick rate, sample size | `metric-card`, `gauge`, `sparkline`, `badge` |
| Import status and errors | `toast-stack`, `alert`, `progress` |
| Settings (auto-import, Flash key, overlay hotkey) | `switch`, `select`, `shortcut-recorder`, `drawer` |
| Browse window layout | `resizable-panels`, `scroll-area`, `skeleton`, `empty-state` |
| Tier list / stats (later) | `sortable-data-table`, `filter-toolbar`, `chip-group` |

Arc has no build-lane or item-fork component, so **we build those ourselves** on Arc tokens and motion: the stage lane, item nodes, component → item lines, and fork branches.

What Deadlock-style means here:
- **Build lanes, not a grid.** A horizontal flow: **Start → First back → Core 1 → Core 2 → Core 3 → Late**. Items are placed at the stage you buy them, with component → full item lines.
- **Forks hang off the lane.** A situational swap shows as a branch from the slot it replaces, labeled with its trigger ("vs heavy healing"). It lights up when the enemy comp matches.
- **Annotated sections.** As in Deadlock's build editor, every section and item can carry a one-line note ("Rush if lane is ranged").
- **Variant switcher** at the top: 1–3 build cards with label, pick share, win rate and a "Recommended" marker with its reason.
- **Two modes:** a full window for browsing, and a **compact overlay** during champ select (runes + core path + import status only). It can stay on top.
- Motion and density stay calm. You glance at this during a 30-second champ select.

---

## 7. Phases

| Phase | Outcome | How you'll know it works |
|---|---|---|
| **0. Setup** | Monorepo, Tauri shell, Arc foundation + skill, CI. You register a Riot developer key. | App window opens; CI green. |
| **1. Client bridge** | Connects to League, follows champ select live, imports a rune page + item set + spells for a few hand-entered test builds. | In a real custom game: correct page every time, your own pages untouched, sets show in the shop. Fixture replay tests pass. |
| **2. Data pipeline** | Actions job crawls matches → clustering → published builds on GitHub Pages for every champion and role on the current patch. | Spot-check 20 champions against U.GG/Lolalytics: core items and keystones match the top builds. Every published rune page passes validation. |
| **3. Recommender** | Enemy-comp traits → recommended variant + active forks, with a one-line reason. | Unit tests on sample comps; the recommendation changes sensibly as enemy picks lock in. |
| **4. UI** | Arc-based theme, custom build lanes, variant switcher, overlay mode. | Usable in a real champ select within 30 seconds. |
| **5. Ship** | Signed installer, auto-update from GitHub Releases, settings, crash logging. | Installing on a clean Windows machine works end to end. |
| **Later** | In-game "next buy" from the Live Client API; read-only website. | — |

Phase 1 comes before builds on purpose. Broken imports are the most visible 1.0 bug, and they're independent of where the builds come from.

---

## 8. Riot policy guardrails

- Register the product on the Riot developer portal before any public release.
- Only show information the client already shows you. For example, don't reveal hidden ranked lobby names.
- The app must stay free to use for core features. Follow Riot's current third-party policies, which are what Blitz and U.GG operate under.

---

## 9. Decisions

- **Desktop app on Tauri 2.** React + TypeScript UI with a small Rust core for the client connection.
- **Summoner's Rift only** for v1.
- **Build data:** Emerald+ ranked solo/duo, NA + EUW + KR.
- **Hosting:** GitHub only (Actions + Pages + Releases). No Cloudflare.
- **UI:** Arc UI components, plus custom Deadlock-style build lanes.
- **Repo:** public, `omeaga1/hexcards-2`, alongside the original `omeaga1/hexcards`.
