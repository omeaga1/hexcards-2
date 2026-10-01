// Per champion and role in one rank bracket: games played and won, plus bans. Published by the
// pipeline as <base>/<patch>/<bracket>/roles.json and turned into role tags and tier lists here.

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

/** The published roles.json. */
export interface RoleData {
  patch: string;
  games: number;
  /** champion ID → bans, and [games, wins] per position. */
  champions: Record<string, { bans: number; roles: Record<Position, [number, number]> }>;
}

export interface ChampionRole {
  role: Role;
  /** Share of this champion's sampled games played in this role, 0–1. */
  share: number;
  games: number;
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

const position = (role: Role) => role.toUpperCase() as Position;

/** Role tags, pick rates and tier list inputs for one bracket's data. */
export class RoleTable {
  constructor(readonly data: RoleData) {}

  get games() {
    return this.data.games;
  }

  /** The roles a champion is played in, most played first. Empty if it wasn't seen. */
  championRoles(championId: number): ChampionRole[] {
    const row = this.data.champions[championId];
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
   * Share of games where this champion was picked in this role, 0–1.
   * In ranked draft a champion can only be picked once per game, so this is games in role / games.
   */
  pickRate(championId: number, role: Role): number {
    const games = this.data.champions[championId]?.roles[position(role)]?.[0] ?? 0;
    return this.data.games === 0 ? 0 : games / this.data.games;
  }

  /** Every champion seen in a role, with games, wins, pick rate and ban rate. */
  roleStats(role: Role): RoleStats[] {
    return Object.entries(this.data.champions).flatMap(([id, row]) => {
      const [games, wins] = row.roles[position(role)] ?? [0, 0];
      if (games === 0) return [];
      return [{
        championId: Number(id),
        role,
        games,
        wins,
        pickRate: games / this.data.games,
        banRate: row.bans / this.data.games,
      }];
    });
  }
}

/** Counts role games, wins and bans from collected games. Used by the pipeline. */
export function countRoles(
  patch: string,
  games: { bans: number[]; players: { champ: number; pos: string; win: number }[] }[],
): RoleData {
  const champions: RoleData['champions'] = {};
  const row = (id: number) =>
    (champions[id] ??= { bans: 0, roles: { TOP: [0, 0], JUNGLE: [0, 0], MIDDLE: [0, 0], BOTTOM: [0, 0], UTILITY: [0, 0] } });
  for (const game of games) {
    for (const p of game.players) {
      const cell = row(p.champ).roles[p.pos as Position];
      if (!cell) continue;
      cell[0]++;
      if (p.win) cell[1]++;
    }
    // A champion can be banned by both teams in one game; count it once per game.
    for (const id of new Set(game.bans)) row(id).bans++;
  }
  return { patch, games: games.length, champions };
}
