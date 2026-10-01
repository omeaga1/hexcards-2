import roleData from './roles.json';

// Per champion and role: games played and won, plus bans, from high-elo ranked games on the current
// patch. roles.json is written by `npm run data:roles` (pipeline/src/roles.mjs).

export const ROLES = ['top', 'jungle', 'middle', 'bottom', 'utility'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };

/** Riot's position icons, the same ones the client shows in champ select. */
export const roleIconUrl = (role: Role) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${role}.png`;

/** A role counts if at least this share of the champion's games were played there... */
const MIN_SHARE = 0.1;
/** ...and it showed up in at least this many games, so one off-role game doesn't tag a champion. */
const MIN_GAMES = 3;

type Position = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';
interface Row {
  bans: number;
  /** [games, wins] */
  roles: Record<Position, [number, number]>;
}

const rows = roleData.champions as unknown as Record<string, Row>;
const position = (role: Role) => role.toUpperCase() as Position;

export const rolesSample = { patch: roleData.patch, games: roleData.games };

export interface ChampionRole {
  role: Role;
  /** Share of this champion's sampled games played in this role, 0–1. */
  share: number;
  games: number;
}

/** The roles a champion is played in, most played first. Empty if it wasn't seen in the sample. */
export function championRoles(championId: number): ChampionRole[] {
  const row = rows[championId];
  if (!row) return [];
  const all = ROLES.map((role) => ({ role, games: row.roles[position(role)]?.[0] ?? 0 }));
  const total = all.reduce((sum, r) => sum + r.games, 0);
  if (total === 0) return [];
  const withShare = all.map((r) => ({ ...r, share: r.games / total })).sort((a, b) => b.games - a.games);
  const tagged = withShare.filter((r) => r.share >= MIN_SHARE && r.games >= MIN_GAMES);
  // Rarely played champions may not clear the bar anywhere: keep their most played role.
  return tagged.length > 0 ? tagged : withShare.slice(0, 1);
}

/**
 * Share of sampled games where this champion was picked in this role, 0–1.
 * In ranked draft a champion can only be picked once per game, so this is games in role / games.
 */
export function rolePickRate(championId: number, role: Role): number {
  const games = rows[championId]?.roles[position(role)]?.[0] ?? 0;
  return roleData.games === 0 ? 0 : games / roleData.games;
}

export interface RoleStats {
  championId: number;
  role: Role;
  games: number;
  wins: number;
  /** Games in this role / all sampled games. */
  pickRate: number;
  /** Games where the champion was banned / all sampled games (across every role). */
  banRate: number;
}

/** Every champion seen in a role, with games, wins, pick rate and ban rate. */
export function roleStats(role: Role): RoleStats[] {
  return Object.entries(rows).flatMap(([id, row]) => {
    const [games, wins] = row.roles[position(role)] ?? [0, 0];
    if (games === 0) return [];
    return [{
      championId: Number(id),
      role,
      games,
      wins,
      pickRate: games / roleData.games,
      banRate: row.bans / roleData.games,
    }];
  });
}
