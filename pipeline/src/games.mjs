// Which games the collector keeps, and which players it draws them from. Pure functions, so they're
// unit-tested (pipeline/test/games.test.mjs) apart from the Riot API.

import { createHash } from 'node:crypto';

export const RANKED_SOLO = 420;
const SUMMONERS_RIFT = 11;
const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
/** Remakes and very short games don't say anything about builds. */
const MIN_SECONDS = 600;

/** Rank brackets: where players are drawn from. A game counts for the bracket of the player it came from. */
export const BRACKETS = {
  new: { tiers: ['SILVER', 'BRONZE', 'IRON'], apex: [] },
  climbing: { tiers: ['EMERALD', 'PLATINUM', 'GOLD'], apex: [] },
  pro: { tiers: ['DIAMOND'], apex: ['challengerleagues', 'grandmasterleagues', 'masterleagues'] },
};

/**
 * Why a fetched match isn't a usable ranked solo/duo game on this patch, or null if it is.
 * The match list is already asked for queue 420, but the match itself is checked too.
 */
export function rejectReason(info, patch) {
  if (info.queueId !== RANKED_SOLO || info.mapId !== SUMMONERS_RIFT || info.gameType !== 'MATCHED_GAME') return 'not ranked solo/duo';
  if (!info.gameVersion?.startsWith(`${patch}.`)) return 'other patch';
  if (info.gameDuration < MIN_SECONDS) return 'remake';
  // Each team needs exactly one player in each position, or roles and matchups are guesses.
  const seats = new Set(info.participants.filter((p) => POSITIONS.includes(p.teamPosition)).map((p) => `${p.teamId}:${p.teamPosition}`));
  if (info.participants.length !== 10 || seats.size !== 10) return 'positions';
  // An AFK or leaver turns the game into 4 against 5: Riot marks them as AFK and not eligible for
  // LP. Their games skew win rates for everyone in them.
  if (info.participants.some((p) => p.wasAfk || p.eligibleForProgression === false)) return 'afk';
  return null;
}

/** "EMERALD II" → "EMERALD"; Master, Grandmaster and Challenger are balanced as one group. */
export function tierGroup(tier) {
  const major = String(tier ?? '').split(' ')[0];
  return ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(major) ? 'MASTER+' : major;
}

/** The tier groups a bracket balances its games across. */
export function bracketGroups(bracket) {
  const { tiers, apex } = BRACKETS[bracket];
  return [...tiers, ...(apex.length ? ['MASTER+'] : [])];
}

/** A short one-way ID for the player a game came from, to cap games per player across runs without storing who they are. */
export function seedId(puuid) {
  return createHash('sha256').update(puuid).digest('base64url').slice(0, 16);
}

/** Fisher–Yates with an injectable random source, so each run starts from different players. */
export function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The group to draw the next player from: the one with the fewest games so far (on disk and this
 * run) that still has players left. Busy tiers can't crowd out quiet ones this way.
 */
export function nextGroup(groups, counts, hasPlayers) {
  let best = null;
  for (const g of groups) {
    if (!hasPlayers(g)) continue;
    if (best === null || (counts[g] ?? 0) < (counts[best] ?? 0)) best = g;
  }
  return best;
}
