// Turns collected games into everything the app shows, per rank bracket: 1 to 3 build variants per
// champion and role, plus role games, wins and bans for role tags and tier lists.
//
//   npx tsx pipeline/src/build.ts [--out apps/desktop/public/builds] [--min-games 40]
//
// Reads pipeline/data/<patch>/<bracket>.ndjson and writes, for each bracket with games:
//   <out>/<patch>/<bracket>/<ChampionKey>.json, index.json and roles.json
// plus <out>/<patch>/traits.json (champion traits for tagging teams in champ select)
// and <out>/latest.json listing the patch and each bracket's game count.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRACKETS, ChampionBuilds, countRoles, type Bracket, type GameRecord, type PerkStyle, type Position } from '@hexcards/data';
import {
  ItemCatalog, buildTraitTable, buildVariants, matchupTraits, toBuildGame,
  type BuildGame, type DDragonItem, type TraitTable,
} from '@hexcards/engine';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const OUT = args.out ?? 'apps/desktop/public/builds';
const MIN_GAMES = Number(args['min-games'] ?? 40);
const ROLE: Record<Position, ChampionBuilds['role']> = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'utility' };

const getJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
};

const version = (await getJson<string[]>('https://ddragon.leagueoflegends.com/api/versions.json'))[0]!;
const patch = version.split('.').slice(0, 2).join('.');
const [itemJson, championJson, perkStyles] = await Promise.all([
  getJson<{ data: Record<string, DDragonItem> }>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`),
  getJson<{ data: Record<string, { key: string; id: string; name: string }> }>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`),
  getJson<{ styles: PerkStyle[] }>('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perkstyles.json'),
]);
const items = new ItemCatalog(itemJson.data);
const champions = new Map(Object.values(championJson.data).map((c) => [Number(c.key), { key: c.id, name: c.name }]));
const generatedAt = new Date().toISOString();
const latest: { patch: string; generatedAt: string; brackets: Partial<Record<Bracket, number>> } = { patch, generatedAt, brackets: {} };

function buildBracket(bracket: Bracket, games: GameRecord[], traits: TraitTable) {
  const dir = join(OUT, patch, bracket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'roles.json'), JSON.stringify(countRoles(patch, games)));

  const groups = new Map<string, BuildGame[]>();
  for (const game of games) {
    for (const p of game.players) {
      const key = `${p.champ}:${p.pos}`;
      const allies = game.players.filter((o) => o.team === p.team && o !== p).map((o) => o.champ);
      const enemies = game.players.filter((o) => o.team !== p.team).map((o) => o.champ);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(toBuildGame(p, items, matchupTraits(traits, allies, enemies)));
    }
  }

  const byChampion = new Map<number, ChampionBuilds[]>();
  for (const [key, group] of groups) {
    const [champ, pos] = key.split(':') as [string, Position];
    const championId = Number(champ);
    const champion = champions.get(championId);
    if (!champion || group.length < MIN_GAMES) continue;
    const variants = buildVariants(group, { items, styles: perkStyles.styles, championName: champion.name });
    if (variants.length === 0) continue;
    // Same schema the app validates with; a bad build stops the run instead of shipping.
    const builds = ChampionBuilds.parse({ patch, championId, championKey: champion.key, role: ROLE[pos], variants });
    (byChampion.get(championId) ?? byChampion.set(championId, []).get(championId)!).push(builds);
  }

  const gamesIn = (r: ChampionBuilds) => r.variants.reduce((s, v) => s + v.stats.games, 0);
  const index: Record<string, { key: string; roles: { role: string; games: number; variants: string[] }[] }> = {};
  for (const [championId, roles] of byChampion) {
    roles.sort((a, b) => gamesIn(b) - gamesIn(a));
    const { key, name } = champions.get(championId)!;
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ patch, championId, championKey: key, roles }));
    index[championId] = { key, roles: roles.map((r) => ({ role: r.role, games: gamesIn(r), variants: r.variants.map((v) => v.label.slice(name.length + 1)) })) };
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ patch, bracket, generatedAt, games: games.length, champions: index }));
  latest.brackets[bracket] = games.length;

  const builds = [...byChampion.values()].flat();
  console.log(`${bracket}: ${games.length} games → ${byChampion.size} champions, ${builds.length} roles, ${builds.reduce((s, r) => s + r.variants.length, 0)} builds`);
}

const byBracket = new Map<Bracket, GameRecord[]>();
for (const bracket of BRACKETS) {
  const file = `pipeline/data/${patch}/${bracket}.ndjson`;
  if (!existsSync(file)) continue;
  byBracket.set(bracket, readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)));
}

// Champion traits come from every bracket together: what a champion does doesn't depend much on
// rank, and more games make the table steadier.
const traits = buildTraitTable([...byBracket.values()].flat());
mkdirSync(join(OUT, patch), { recursive: true });
writeFileSync(join(OUT, patch, 'traits.json'), JSON.stringify(traits));
const traitCounts: Record<string, number> = {};
for (const list of Object.values(traits)) for (const t of list) traitCounts[t] = (traitCounts[t] ?? 0) + 1;
console.log(`traits: ${Object.keys(traits).length} champions`, traitCounts);

for (const [bracket, games] of byBracket) if (games.length > 0) buildBracket(bracket, games, traits);
writeFileSync(join(OUT, 'latest.json'), JSON.stringify(latest));
