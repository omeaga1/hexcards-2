// Collects ranked solo games on the current patch, with timelines, into one compact record per game.
// This is the raw material for builds, tier lists and roles: runes, spells, skill order, item purchases
// with timestamps, both team compositions, and what each player did.
//
//   node pipeline/src/collect.mjs [--patch 16.19] [--brackets new,climbing,pro] [--per-region 500] [--minutes 330]
//
// Games are grouped into three rank brackets. Each region cycles between them so they fill evenly,
// and within a bracket draws from whichever tier has the fewest games so far. Records are appended
// to pipeline/data/<patch>/<bracket>.ndjson as they arrive, so stopping partway never loses data,
// and a rerun skips games already collected in any bracket.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { REGIONS, RiotClient, currentPatch, riotKeyFromEnv } from './riot.mjs';
import { BRACKETS, RANKED_SOLO, bracketGroups, nextGroup, rejectReason, seedId, shuffle, tierGroup } from './games.mjs';

const DIVISIONS = ['I', 'II', 'III', 'IV'];
/** Ladder pages to draw players from in each division (up to 205 players a page). */
const PAGES = [1, 2];
/** Take at most this many new games from one player in a run before moving on... */
const GAMES_PER_PLAYER = 4;
/** ...and at most this many over the whole patch, so a bracket isn't a few busy players. */
const GAMES_PER_PLAYER_PER_PATCH = 12;

// "--name value" pairs. Values are taken whole, so a path with "--" in it survives.
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
const brackets = (args.brackets ?? 'new,climbing,pro').split(',').filter((b) => b in BRACKETS);
const PER_REGION = Number(args['per-region'] ?? 500);
const DEADLINE = Date.now() + Number(args.minutes ?? 330) * 60_000;

const SKILL_KEYS = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };

const riot = new RiotClient(riotKeyFromEnv());
// The workflow passes the patch it restored data for, so a patch going live mid-run can't split the work.
const patch = args.patch ?? (await currentPatch());
const dir = new URL(`../data/${patch}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const fileFor = (bracket) => new URL(`${bracket}.ndjson`, dir);

// Resume: skip games already on disk, and pick up each bracket's tier balance and each player's game count.
const have = new Set();
const groupCounts = Object.fromEntries(Object.keys(BRACKETS).map((b) => [b, {}]));
const seedCounts = new Map();
for (const bracket of Object.keys(BRACKETS)) {
  if (!existsSync(fileFor(bracket))) continue;
  for (const line of readFileSync(fileFor(bracket), 'utf8').split('\n')) {
    if (!line) continue;
    const record = JSON.parse(line);
    have.add(record.id);
    if (record.tier) {
      const group = tierGroup(record.tier);
      groupCounts[bracket][group] = (groupCounts[bracket][group] ?? 0) + 1;
    }
    if (record.seed) seedCounts.set(record.seed, (seedCounts.get(record.seed) ?? 0) + 1);
  }
}
console.log(`Patch ${patch}: ${have.size} games on disk. Collecting up to ${PER_REGION} per bracket per region for ${brackets.join(', ')}.`);
for (const b of brackets) console.log(`  ${b} so far: ${JSON.stringify(groupCounts[b])}`);

/** [keystone, primary ×3, secondary ×2, shards: offense, flex, defense] plus the two tree IDs. */
function runePage(perks) {
  const [primary, secondary] = perks?.styles ?? [];
  if (!primary || !secondary) return null;
  const shards = perks.statPerks ?? {};
  return {
    p: primary.style,
    s: secondary.style,
    ids: [...primary.selections.map((x) => x.perk), ...secondary.selections.map((x) => x.perk), shards.offense, shards.flex, shards.defense],
  };
}

/**
 * Per participant from the timeline: skill order as "QWEQ..." and item purchases as
 * [itemId, seconds], with undone purchases removed.
 */
function fromTimeline(timeline) {
  const skills = {};
  const buys = {};
  for (const frame of timeline.info.frames) {
    for (const e of frame.events) {
      const pid = e.participantId;
      if (e.type === 'SKILL_LEVEL_UP' && e.levelUpType === 'NORMAL' && SKILL_KEYS[e.skillSlot]) {
        skills[pid] = (skills[pid] ?? '') + SKILL_KEYS[e.skillSlot];
      } else if (e.type === 'ITEM_PURCHASED') {
        (buys[pid] ??= []).push([e.itemId, Math.round(e.timestamp / 1000)]);
      } else if (e.type === 'ITEM_UNDO' && e.beforeId > 0) {
        // Undoing a purchase: drop the most recent purchase of that item.
        const list = buys[pid] ?? [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i][0] === e.beforeId) {
            list.splice(i, 1);
            break;
          }
        }
      }
    }
  }
  return { skills, buys };
}

function toRecord(region, bracket, tier, seed, match, timeline) {
  const { skills, buys } = fromTimeline(timeline);
  const info = match.info;
  return {
    id: match.metadata.matchId,
    region,
    bracket,
    tier,
    seed,
    version: info.gameVersion,
    duration: info.gameDuration,
    bans: info.teams.flatMap((t) => t.bans.map((b) => b.championId)).filter((id) => id > 0),
    players: info.participants.map((p) => ({
      champ: p.championId,
      team: p.teamId,
      pos: p.teamPosition,
      win: p.win ? 1 : 0,
      runes: runePage(p.perks),
      spells: [p.summoner1Id, p.summoner2Id],
      skills: skills[p.participantId] ?? '',
      buys: buys[p.participantId] ?? [],
      // What the champion actually did, for team-composition traits (AP/AD, healing, tanking, CC):
      // [physical, magic, true damage to champions, self healing, healing on allies,
      //  shields on allies, damage mitigated, damage taken, seconds of CC on enemies]
      stats: [
        p.physicalDamageDealtToChampions, p.magicDamageDealtToChampions, p.trueDamageDealtToChampions,
        p.totalHeal - p.totalHealsOnTeammates, p.totalHealsOnTeammates, p.totalDamageShieldedOnTeammates,
        p.damageSelfMitigated, p.totalDamageTaken, p.timeCCingOthers,
      ],
    })),
  };
}

/** Players for a bracket in one region, in shuffled queues per tier group, so each run starts with different players. */
async function playersFor(platform, bracket) {
  const { tiers, apex } = BRACKETS[bracket];
  const queues = Object.fromEntries(bracketGroups(bracket).map((g) => [g, []]));
  for (const ladder of apex) {
    const league = await riot.get(platform, `/lol/league/v4/${ladder}/by-queue/RANKED_SOLO_5x5`);
    queues['MASTER+'].push(...(league?.entries ?? []).map((e) => ({ puuid: e.puuid, tier: league.tier })));
  }
  for (const tier of tiers) {
    for (const division of DIVISIONS) {
      for (const page of PAGES) {
        const entries = (await riot.get(platform, `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`)) ?? [];
        queues[tier].push(...entries.map((e) => ({ puuid: e.puuid, tier: `${tier} ${division}` })));
      }
    }
  }
  for (const g of Object.keys(queues)) queues[g] = shuffle(queues[g]).filter((p) => (seedCounts.get(seedId(p.puuid)) ?? 0) < GAMES_PER_PLAYER_PER_PATCH);
  return queues;
}

const counts = Object.fromEntries(brackets.map((b) => [b, 0]));
const rejected = {};

async function collectRegion({ platform, regional }) {
  const pools = {};
  for (const bracket of brackets) pools[bracket] = { queues: await playersFor(platform, bracket), collected: 0 };

  const hasPlayers = (bracket) => (g) => pools[bracket].queues[g].length > 0;
  const open = () => brackets.filter((b) => pools[b].collected < PER_REGION && bracketGroups(b).some(hasPlayers(b)));
  while (Date.now() < DEADLINE && open().length > 0) {
    // One player from each bracket that still needs games, in turn, from its least collected tier.
    for (const bracket of open()) {
      const pool = pools[bracket];
      const group = nextGroup(bracketGroups(bracket), groupCounts[bracket], hasPlayers(bracket));
      if (!group) continue;
      const { puuid, tier } = pool.queues[group].shift();
      const seed = seedId(puuid);
      const ids = (await riot.get(regional, `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO}&type=ranked&count=20`)) ?? [];
      let fromPlayer = 0;
      for (const id of ids) {
        if (fromPlayer >= GAMES_PER_PLAYER || (seedCounts.get(seed) ?? 0) >= GAMES_PER_PLAYER_PER_PATCH) break;
        if (pool.collected >= PER_REGION || Date.now() > DEADLINE) break;
        if (have.has(id)) continue;
        have.add(id);
        const match = await riot.get(regional, `/lol/match/v5/matches/${id}`);
        if (!match?.info) continue;
        const reason = rejectReason(match.info, patch);
        // Match lists are newest first: once a game is from another patch, the rest are older still.
        if (reason === 'other patch') break;
        if (reason) {
          rejected[reason] = (rejected[reason] ?? 0) + 1;
          continue;
        }
        const timeline = await riot.get(regional, `/lol/match/v5/matches/${id}/timeline`);
        if (!timeline?.info) continue;
        appendFileSync(fileFor(bracket), JSON.stringify(toRecord(platform, bracket, tier, seed, match, timeline)) + '\n');
        fromPlayer++;
        pool.collected++;
        counts[bracket]++;
        groupCounts[bracket][group] = (groupCounts[bracket][group] ?? 0) + 1;
        seedCounts.set(seed, (seedCounts.get(seed) ?? 0) + 1);
        if (pool.collected % 25 === 0) console.log(`  ${platform} ${bracket}: ${pool.collected} games`);
      }
    }
  }
  console.log(`  ${platform}: done, ${brackets.map((b) => `${b} ${pools[b].collected}`).join(', ')}`);
}

await Promise.all(REGIONS.map(collectRegion));
console.log(`Collected ${Object.entries(counts).map(([b, n]) => `${n} ${b}`).join(', ')} games for patch ${patch}.`);
console.log(`Skipped: ${JSON.stringify(rejected)}`);
for (const b of brackets) console.log(`  ${b} by tier: ${JSON.stringify(groupCounts[b])}`);
