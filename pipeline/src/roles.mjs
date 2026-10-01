// Counts which role each champion is played in, from high-elo ranked solo games on the current patch.
// Writes packages/data/src/roles.json, which the app uses to tag and filter champions by role.
//
//   node pipeline/src/roles.mjs [matchesPerRegion=800]

import { writeFileSync } from 'node:fs';
import { RANKED_SOLO, REGIONS, RiotClient, currentPatch, riotKeyFromEnv } from './riot.mjs';

const MATCHES_PER_REGION = Number(process.argv[2] ?? 800);
const OUT = new URL('../../packages/data/src/roles.json', import.meta.url);
const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

const riot = new RiotClient(riotKeyFromEnv());
const patch = await currentPatch();
console.log(`Patch ${patch}: sampling ${MATCHES_PER_REGION} matches in each of ${REGIONS.map((r) => r.platform).join(', ')}`);

/** championId → { TOP: n, JUNGLE: n, ... } */
const counts = new Map();
let games = 0;

async function sampleRegion({ platform, regional }) {
  const ladders = await Promise.all(
    ['challengerleagues', 'grandmasterleagues'].map((l) => riot.get(platform, `/lol/league/v4/${l}/by-queue/RANKED_SOLO_5x5`)),
  );
  const players = ladders.flatMap((l) => l?.entries ?? []).sort((a, b) => b.leaguePoints - a.leaguePoints).map((e) => e.puuid);

  const seen = new Set();
  let regionGames = 0;
  for (const puuid of players) {
    if (regionGames >= MATCHES_PER_REGION) break;
    const ids = (await riot.get(regional, `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO}&type=ranked&count=20`)) ?? [];
    for (const id of ids) {
      if (regionGames >= MATCHES_PER_REGION) break;
      if (seen.has(id)) continue;
      seen.add(id);
      const match = await riot.get(regional, `/lol/match/v5/matches/${id}`);
      if (!match?.info) continue;
      // Match lists are newest first: once a game is from an older patch, the rest are too.
      if (!match.info.gameVersion?.startsWith(`${patch}.`)) break;
      // Skip remakes: positions are unreliable in games that end before 5 minutes.
      if (match.info.gameDuration < 300) continue;
      for (const p of match.info.participants) {
        if (!POSITIONS.includes(p.teamPosition)) continue;
        const row = counts.get(p.championId) ?? Object.fromEntries(POSITIONS.map((pos) => [pos, 0]));
        row[p.teamPosition]++;
        counts.set(p.championId, row);
      }
      regionGames++;
      games++;
      if (regionGames % 50 === 0) console.log(`  ${platform}: ${regionGames} matches`);
    }
  }
  console.log(`  ${platform}: done, ${regionGames} matches`);
}

await Promise.all(REGIONS.map(sampleRegion));

const champions = Object.fromEntries([...counts].sort(([a], [b]) => a - b).map(([id, row]) => [id, row]));
writeFileSync(OUT, JSON.stringify({ patch, generatedAt: new Date().toISOString(), games, champions }, null, 2) + '\n');
console.log(`Wrote ${counts.size} champions from ${games} matches to packages/data/src/roles.json`);
