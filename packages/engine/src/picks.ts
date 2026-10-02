// Champion suggestions for champ select: who to pick in your role against these teams. Deterministic
// math from the published pick table, like the build recommendation; no model guesses.

import type { PickTable, Role, RoleTable, Trait } from '@hexcards/data';
import { matchupTraits, type TraitTable } from './aggregate/traits';

/** Imaginary 50% games a champion's win rate is pulled toward, like the tier list. */
const BASE_PRIOR = 100;
/** Imaginary games of "no difference" a lane matchup is weighed against. */
const LANE_PRIOR = 100;
/** Imaginary games of "no difference" each team trait is weighed against. */
const TRAIT_PRIOR = 300;
/** A champion needs this many games in the role to be suggested. */
export const MIN_PICK_GAMES = 50;
/** An enemy is only taken as your lane opponent if it plays that role in this share of its games. */
const MIN_LANE_SHARE = 0.2;
/** A reason is only given when it moves the score this much, with this many games behind it. */
const MIN_REASON_DELTA = 0.004;
const MIN_REASON_GAMES = 30;

export type PickReason =
  | { kind: 'lane'; opponent: number; games: number; winRate: number }
  | { kind: 'trait'; trait: Trait; games: number; winRate: number }
  | { kind: 'strong'; winRate: number; games: number };

export interface PickSuggestion {
  championId: number;
  /** Win rate in the role pulled toward 50%, plus the lane and team effects. Only the order means anything. */
  score: number;
  reason: PickReason;
}

export interface PickInput {
  role: Role;
  picks: PickTable;
  roles: RoleTable;
  traitTable: TraitTable;
  /** Your teammates' champions (picked or hovered), not yours. */
  allies: number[];
  enemies: number[];
  /** Picked or banned already. */
  unavailable: Set<number>;
  /** The champions you can play, when the client says; otherwise everyone counts. */
  owned?: Set<number> | null;
  limit?: number;
}

/**
 * Which role each enemy champion is most likely in: the assignment of champions to different roles
 * that best matches how often each plays each role. The client doesn't show enemy roles, so this
 * is a guess from the champions alone.
 */
export function guessRoles(enemies: number[], share: (championId: number, role: Role) => number): Map<number, Role> {
  const roles: Role[] = ['top', 'jungle', 'middle', 'bottom', 'utility'];
  let best: { score: number; assignment: Role[] } = { score: -Infinity, assignment: [] };
  const place = (i: number, used: Set<Role>, assignment: Role[], score: number) => {
    if (i === enemies.length) {
      if (score > best.score) best = { score, assignment: [...assignment] };
      return;
    }
    for (const role of roles) {
      if (used.has(role)) continue;
      used.add(role);
      assignment.push(role);
      place(i + 1, used, assignment, score + Math.log(share(enemies[i]!, role) + 0.01));
      assignment.pop();
      used.delete(role);
    }
  };
  place(0, new Set(), [], 0);
  return new Map(best.assignment.map((role, i) => [enemies[i]!, role]));
}

/** Your likely lane opponent among the enemy picks, if one plausibly plays your role. */
export function laneOpponent(role: Role, enemies: number[], roles: RoleTable): number | undefined {
  const share = (id: number, r: Role) => roles.championRoles(id).find((x) => x.role === r)?.share ?? 0;
  const guess = [...guessRoles(enemies, share)].find(([, r]) => r === role)?.[0];
  return guess !== undefined && share(guess, role) >= MIN_LANE_SHARE ? guess : undefined;
}

/**
 * The best champions to pick in your role against these teams, best first. Each is scored on its
 * own win rate in the role, how much better it does than usual against your likely lane opponent,
 * and how it handles the team traits in play. Lane and trait effects are measured against the role
 * as a whole (a weak enemy laner makes everyone look good) and weighed down when games are few, so
 * a champion with a handful of lucky games can't top the list.
 */
export function suggestPicks(input: PickInput): { opponent?: number; suggestions: PickSuggestion[] } {
  const { role, picks, roles, traitTable, allies, enemies, unavailable, owned, limit = 5 } = input;
  const rows = Object.entries(picks).flatMap(([id, byRole]) => (byRole[role] ? [{ id: Number(id), row: byRole[role]! }] : []));
  const total = rows.reduce((s, r) => s + r.row.games, 0);
  if (total === 0) return { suggestions: [] };
  const roleRate = rows.reduce((s, r) => s + r.row.wins, 0) / total;
  const shift = (cells: ([number, number] | undefined)[]) => {
    const games = cells.reduce((s, c) => s + (c?.[0] ?? 0), 0);
    return games ? cells.reduce((s, c) => s + (c?.[1] ?? 0), 0) / games - roleRate : 0;
  };

  const opponent = laneOpponent(role, enemies, roles);
  const laneShift = opponent === undefined ? 0 : shift(rows.map((r) => r.row.vs[opponent]));
  const active = [...matchupTraits(traitTable, allies, enemies)] as Trait[];
  const traitShift = new Map(active.map((t) => [t, shift(rows.map((r) => r.row.traits[t]))]));

  const scored = rows
    .filter(({ id, row }) =>
      row.games >= MIN_PICK_GAMES &&
      !unavailable.has(id) &&
      (!owned || owned.has(id)) &&
      roles.championRoles(id).some((r) => r.role === role))
    .map(({ id, row }): PickSuggestion & { parts: PickReason[]; deltas: number[] } => {
      const rate = row.wins / row.games;
      const base = (row.wins + BASE_PRIOR * 0.5) / (row.games + BASE_PRIOR);
      const parts: PickReason[] = [];
      const deltas: number[] = [];

      let lane = 0;
      const vs = opponent === undefined ? undefined : row.vs[opponent];
      if (vs) {
        lane = ((vs[1] / vs[0] - rate - laneShift) * vs[0]) / (vs[0] + LANE_PRIOR);
        parts.push({ kind: 'lane', opponent: opponent!, games: vs[0], winRate: vs[1] / vs[0] });
        deltas.push(lane);
      }
      const traitDeltas = active.flatMap((trait) => {
        const cell = row.traits[trait];
        if (!cell) return [];
        const delta = ((cell[1] / cell[0] - rate - traitShift.get(trait)!) * cell[0]) / (cell[0] + TRAIT_PRIOR);
        parts.push({ kind: 'trait', trait, games: cell[0], winRate: cell[1] / cell[0] });
        deltas.push(delta);
        return [delta];
      });
      // Averaged, like the build recommendation: the same games show up under every trait in play.
      const teams = traitDeltas.length ? traitDeltas.reduce((s, d) => s + d, 0) / traitDeltas.length : 0;
      return { championId: id, score: base + lane + teams, reason: { kind: 'strong', winRate: rate, games: row.games }, parts, deltas };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Each suggestion's reason: what helps it most here, if it's enough to mention; otherwise its record in the role.
  const suggestions = scored.map(({ parts, deltas, ...s }) => {
    const order = deltas.map((d, i) => i).sort((a, b) => deltas[b]! - deltas[a]!);
    const top = order.find((i) => deltas[i]! >= MIN_REASON_DELTA && parts[i]!.games >= MIN_REASON_GAMES);
    return top === undefined ? s : { ...s, reason: parts[top]! };
  });
  return { opponent, suggestions };
}
