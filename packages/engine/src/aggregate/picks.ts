// What the champ select pick suggestions are made from: per champion and role, games and wins with
// each team trait in play and against each lane opponent. Published as picks.json per bracket.

import type { GameRecord, PickTable, Role, Trait } from '@hexcards/data';
import { matchupTraits, type TraitTable } from './traits';

/** Lane matchups seen fewer times than this are left out; they'd be noise and bloat the file. */
const MIN_PAIR_GAMES = 3;

export function countPicks(games: GameRecord[], traits: TraitTable): PickTable {
  const table: PickTable = {};
  for (const game of games) {
    for (const p of game.players) {
      const role = p.pos.toLowerCase() as Role;
      const row = ((table[p.champ] ??= {})[role] ??= { games: 0, wins: 0, traits: {}, vs: {} });
      row.games++;
      row.wins += p.win;
      const allies = game.players.filter((o) => o.team === p.team && o !== p).map((o) => o.champ);
      const enemies = game.players.filter((o) => o.team !== p.team);
      for (const trait of matchupTraits(traits, allies, enemies.map((o) => o.champ))) {
        const cell = (row.traits[trait as Trait] ??= [0, 0]);
        cell[0]++;
        cell[1] += p.win;
      }
      const opponent = enemies.find((o) => o.pos === p.pos);
      if (opponent) {
        const cell = (row.vs[opponent.champ] ??= [0, 0]);
        cell[0]++;
        cell[1] += p.win;
      }
    }
  }
  for (const roles of Object.values(table)) {
    for (const row of Object.values(roles)) {
      for (const [opponent, [n]] of Object.entries(row!.vs)) if (n < MIN_PAIR_GAMES) delete row!.vs[opponent];
    }
  }
  return table;
}
