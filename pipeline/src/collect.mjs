// Collects high-elo ranked solo games on the current patch, with timelines, into one compact record
// per game. This is the raw material for builds: runes, spells, skill order, item purchases with
// timestamps, and both team compositions.
//
//   node pipeline/src/collect.mjs [--per-region 500] [--minutes 330]
//
// Records are appended to pipeline/data/<patch>/games.ndjson as they arrive, so stopping partway
// never loses data, and a rerun skips games already collected.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { RANKED_SOLO, REGIONS, RiotClient, currentPatch, riotKeyFromEnv } from './riot.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const PER_REGION = Number(args['per-region'] ?? 500);
const DEADLINE = Date.now() + Number(args.minutes ?? 330) * 60_000;

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const SKILL_KEYS = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };
const LADDERS = ['challengerleagues', 'grandmasterleagues', 'masterleagues'];

const riot = new RiotClient(riotKeyFromEnv());
const patch = await currentPatch();
const dir = new URL(`../data/${patch}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const OUT = new URL('games.ndjson', dir);

// Resume: skip games already on disk.
const have = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (line) have.add(JSON.parse(line).id);
  }
}
console.log(`Patch ${patch}: ${have.size} games on disk. Collecting up to ${PER_REGION} more per region.`);

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

function toRecord(region, match, timeline) {
  const { skills, buys } = fromTimeline(timeline);
  const info = match.info;
  return {
    id: match.metadata.matchId,
    region,
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

let total = 0;

async function collectRegion({ platform, regional }) {
  const players = [];
  for (const ladder of LADDERS) {
    const league = await riot.get(platform, `/lol/league/v4/${ladder}/by-queue/RANKED_SOLO_5x5`);
    players.push(...(league?.entries ?? []).sort((a, b) => b.leaguePoints - a.leaguePoints).map((e) => e.puuid));
  }

  let collected = 0;
  for (const puuid of players) {
    if (collected >= PER_REGION || Date.now() > DEADLINE) break;
    const ids = (await riot.get(regional, `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${RANKED_SOLO}&type=ranked&count=20`)) ?? [];
    for (const id of ids) {
      if (collected >= PER_REGION || Date.now() > DEADLINE) break;
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
      appendFileSync(OUT, JSON.stringify(toRecord(platform, match, timeline)) + '\n');
      collected++;
      total++;
      if (collected % 25 === 0) console.log(`  ${platform}: ${collected} games`);
    }
  }
  console.log(`  ${platform}: done, ${collected} new games`);
}

await Promise.all(REGIONS.map(collectRegion));
console.log(`Collected ${total} new games. ${have.size} match IDs seen for patch ${patch}.`);
