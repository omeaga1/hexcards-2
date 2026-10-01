// Turns collected games into published builds: 1 to 3 variants per champion and role.
//
//   npx tsx pipeline/src/build.ts [--out apps/desktop/public/builds] [--min-games 40]
//
// Reads pipeline/data/<patch>/games.ndjson and writes <out>/<patch>/<ChampionKey>.json plus
// <out>/<patch>/index.json and <out>/latest.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChampionBuilds, type GameRecord, type PerkStyle, type Position } from '@hexcards/data';
import { ItemCatalog, buildVariants, toBuildGame, type BuildGame, type DDragonItem } from '@hexcards/engine';

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

const games: GameRecord[] = readFileSync(`pipeline/data/${patch}/games.ndjson`, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
console.log(`Patch ${patch}: ${games.length} games`);

const groups = new Map<string, BuildGame[]>();
for (const game of games) {
  for (const p of game.players) {
    const key = `${p.champ}:${p.pos}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(toBuildGame(p, items));
  }
}

const dir = join(OUT, patch);
mkdirSync(dir, { recursive: true });
const byChampion = new Map<number, ChampionBuilds[]>();
let skipped = 0;
for (const [key, group] of groups) {
  const [champ, pos] = key.split(':') as [string, Position];
  const championId = Number(champ);
  const champion = champions.get(championId);
  if (!champion || group.length < MIN_GAMES) {
    skipped++;
    continue;
  }
  const variants = buildVariants(group, { items, styles: perkStyles.styles, championName: champion.name });
  if (variants.length === 0) {
    skipped++;
    continue;
  }
  // Same schema the app validates with; a bad build stops the run instead of shipping.
  const builds = ChampionBuilds.parse({ patch, championId, championKey: champion.key, role: ROLE[pos], variants });
  (byChampion.get(championId) ?? byChampion.set(championId, []).get(championId)!).push(builds);
}

const index: Record<string, { key: string; roles: { role: string; games: number; variants: number }[] }> = {};
for (const [championId, roles] of byChampion) {
  roles.sort((a, b) => b.variants.reduce((s, v) => s + v.stats.games, 0) - a.variants.reduce((s, v) => s + v.stats.games, 0));
  const key = champions.get(championId)!.key;
  writeFileSync(join(dir, `${key}.json`), JSON.stringify({ patch, championId, championKey: key, roles }));
  index[championId] = {
    key,
    roles: roles.map((r) => ({ role: r.role, games: r.variants.reduce((s, v) => s + v.stats.games, 0), variants: r.variants.length })),
  };
}
const generatedAt = new Date().toISOString();
writeFileSync(join(dir, 'index.json'), JSON.stringify({ patch, generatedAt, games: games.length, champions: index }));
writeFileSync(join(OUT, 'latest.json'), JSON.stringify({ patch, generatedAt }));

const roleCount = [...byChampion.values()].reduce((s, r) => s + r.length, 0);
const variantCount = [...byChampion.values()].flat().reduce((s, r) => s + r.variants.length, 0);
console.log(`Wrote ${byChampion.size} champions, ${roleCount} champion roles, ${variantCount} builds to ${dir} (${skipped} groups under ${MIN_GAMES} games or without a valid build)`);
