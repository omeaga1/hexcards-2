import type { RoleStats } from '@hexcards/data';

export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Share of ranked champions in each tier, best first: top 10% are S, next 20% A, and so on.
 * Tiers are relative to the other champions in the role, like every tier list.
 */
const TIER_SHARES: Record<Tier, number> = { S: 0.1, A: 0.2, B: 0.35, C: 0.25, D: 0.1 };

/** Champions need this many games in the role to be ranked at all. */
export const MIN_TIER_GAMES = 10;

/**
 * Win rates are pulled toward 50% by this many imaginary games, so a hot streak over a dozen games
 * (9-3) doesn't outrank a strong record over hundreds (220-180). The more real games a champion
 * has, the less this matters.
 */
const PRIOR_GAMES = 100;

export interface TierEntry extends RoleStats {
  winRate: number;
  /** Win rate after pulling it toward 50% by PRIOR_GAMES; this is what champions are ranked by. */
  adjustedWinRate: number;
}

export interface TierList {
  tiers: { tier: Tier; entries: TierEntry[] }[];
  /** Seen in the role, but too few games to rank. */
  lowSample: TierEntry[];
}

export const adjustedWinRate = (wins: number, games: number) => (wins + PRIOR_GAMES * 0.5) / (games + PRIOR_GAMES);

export function buildTierList(stats: RoleStats[]): TierList {
  const entries: TierEntry[] = stats.map((s) => ({
    ...s,
    winRate: s.games ? s.wins / s.games : 0,
    adjustedWinRate: adjustedWinRate(s.wins, s.games),
  }));
  const ranked = entries
    .filter((e) => e.games >= MIN_TIER_GAMES)
    .sort((a, b) => b.adjustedWinRate - a.adjustedWinRate || b.games - a.games);
  const lowSample = entries.filter((e) => e.games < MIN_TIER_GAMES).sort((a, b) => b.games - a.games);

  let start = 0;
  let cumulative = 0;
  const tiers = TIERS.map((tier, i) => {
    cumulative += TIER_SHARES[tier];
    // The last tier takes whatever is left so rounding never drops a champion.
    const end = i === TIERS.length - 1 ? ranked.length : Math.round(cumulative * ranked.length);
    const slice = ranked.slice(start, end);
    start = end;
    return { tier, entries: slice };
  });
  return { tiers, lowSample };
}
