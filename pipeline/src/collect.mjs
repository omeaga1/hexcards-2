// Collects ranked solo games on the current patch, with timelines, into one compact record per game.
// This is the raw material for builds, tier lists and roles: runes, spells, skill order, item purchases
// with timestamps, both team compositions, and what each player did.
//
//   node pipeline/src/collect.mjs [--brackets new,climbing,pro] [--per-region 500] [--minutes 330]
//
// Games are grouped into three rank brackets. Each region cycles between them so they fill evenly.
// Records are appended to pipeline/data/<patch>/<bracket>.ndjson as they arrive, so stopping partway
// never loses data, and a rerun skips games already collected in any bracket.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { RANKED_SOLO, REGIONS, RiotClient, currentPatch, riotKeyFromEnv } from './riot.mjs';

/** Rank brackets: where players are drawn from. A game counts for the bracket of the player it came from. */
export const BRACKETS = {
  new: { tiers: ['SILVER', 'BRONZE', 'IRON'], apex: [] },
  climbing: { tiers: ['EMERALD', 'PLATINUM', 'GOLD'], apex: [] },
  pro: { tiers: ['DIAMOND'], apex: ['challengerleagues', 'grandmasterleagues', 'masterleagues'] },
};
const DIVISIONS = ['I', 'II', 'III', 'IV'];
/** Take at most this many new games from one player before moving on, so a bracket isn't a few people. */
const GAMES_PER_PLAYER = 4;

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const brackets = (args.brackets ?? 'new,climbing,pro').split(',').filter((b) => b in BRACKETS);
const PER_REGION = Number(args['per-region'] ?? 500);
const DEADLINE = Date.now() + Number(args.minutes ?? 330) * 60_000;

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const SKILL_KEYS = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };

const riot = new RiotClient(riotKeyFromEnv());
const patch = await currentPatch();
const dir = new URL(`../data/${patch}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const fileFor = (bracket) => new URL(`${bracket}.ndjson`, dir);

// Resume: skip games already on disk in any bracket.
const have = new Set();
for (const bracket of Object.keys(BRACKETS)) {
  if (!existsSync(fileFor(bracket))) continue;
  for (const line of readFileSync(fileFor(bracket), 'utf8').split('\n')) {
    if (line) have.add(JSON.parse(line).id);
  }
}
console.log(`Patch ${patch}: ${have.size} games on disk. Collecting up to ${PER_REGION} per bracket per region for ${brackets.join(', ')}.`);

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

function toRecord(region, bracket, tier, match, timeline) {
  const { skills, buys } = fromTimeline(timeline);
  const info = match.info;
  return {
    id: match.metadata.matchId,
    region,
    bracket,
    tier,
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

/** Players for a bracket in one region, mixing tiers and divisions so no single one dominates. */
async function playersFor(platform, bracket) {
  const { tiers, apex } = BRACKETS[bracket];
  const lists = [];
  for (const ladder of apex) {
    const league = await riot.get(platform, `/lol/league/v4/${ladder}/by-queue/RANKED_SOLO_5x5`);
    lists.push((league?.entries ?? []).map((e) => ({ puuid: e.puuid, tier: league.tier })));
  }
  for (const tier of tiers) {
    for (const division of DIVISIONS) {
      const entries = (await riot.get(platform, `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=1`)) ?? [];
      lists.push(entries.map((e) => ({ puuid: e.puuid, tier: `${tier} ${division}` })));
    }
  }
  // Interleave: one player from each list in turn.
  const mixed = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) mixed.push(l[i]);
  return mixed;
}

const counts = Object.fromEntries(brackets.map((b) => [b, 0]));

async function collectRegion({ platform, regional }) {
  const pools = {};
  for (const bracket of brackets) pools[bracket] = { players: await playersFor(platform, bracket), next: 0, collected: 0 };

  const open = () => brackets.filter((b) => pools[b].collected < PER_REGION && pools[b].next < pools[b].players.length);
  while (Date.now() < DEADLINE && open().length > 0) {
    // One player from each bracket that still needs games, in turn.
    for (const bracket of open()) {
      const pool = pools[bracket];
      const { puuid, tier } = pool.players[pool.next++];
      const ids = (await riot.get(regional, `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO}&type=ranked&count=20`)) ?? [];
      let fromPlayer = 0;
      for (const id of ids) {
        if (fromPlayer >= GAMES_PER_PLAYER || pool.collected >= PER_REGION || Date.now() > DEADLINE) break;
        if (have.has(id)) continue;
        have.add(id);
        const match = await riot.get(regional, `/lol/match/v5/matches/${id}`);
        if (!match?.info) continue;
        // Match lists are newest first: once a game is from an older patch, the rest are too.
        if (!match.info.gameVersion?.startsWith(`${patch}.`)) break;
        // Remakes and games without proper positions don't say anything about builds.
        if (match.info.gameDuration < 600) continue;
        if (!match.info.participants.every((p) => POSITIONS.includes(p.teamPosition))) continue;
        const timeline = await riot.get(regional, `/lol/match/v5/matches/${id}/timeline`);
        if (!timeline?.info) continue;
        appendFileSync(fileFor(bracket), JSON.stringify(toRecord(platform, bracket, tier, match, timeline)) + '\n');
        fromPlayer++;
        pool.collected++;
        counts[bracket]++;
        if (pool.collected % 25 === 0) console.log(`  ${platform} ${bracket}: ${pool.collected} games`);
      }
    }
  }
  console.log(`  ${platform}: done, ${brackets.map((b) => `${b} ${pools[b].collected}`).join(', ')}`);
}

await Promise.all(REGIONS.map(collectRegion));
console.log(`Collected ${Object.entries(counts).map(([b, n]) => `${n} ${b}`).join(', ')} games for patch ${patch}.`);
