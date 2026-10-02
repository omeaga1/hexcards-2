// Team-composition traits, from what champions actually do in games rather than a hand-written list.
// Each champion gets an average damage split, healing, shielding, tankiness and crowd control from
// collected games; champions near the top of each become healers, tanks, and so on. A team's traits
// then follow from its champions, which is all the app knows in champ select.

import type { GameRecord, Trait } from '@hexcards/data';

export type ChampionTrait = 'ap' | 'ad' | 'healer' | 'tank' | 'shielder' | 'cc';

/** champion ID → its traits. Published as traits.json so the app can tag teams in champ select. */
export type TraitTable = Record<string, ChampionTrait[]>;

/** Damage this share magic (or physical) makes a champion an AP (or AD) threat. */
const DAMAGE_SHARE = 0.65;
/** Champions in the top share of all champions for a stat get that trait. */
const TOP_SHARE: Record<'healer' | 'tank' | 'shielder' | 'cc', number> = { healer: 0.15, tank: 0.2, shielder: 0.1, cc: 0.2 };
/** Champions need this many games with stats to get traits. */
const MIN_GAMES = 15;

interface Totals {
  games: number;
  physical: number;
  magic: number;
  true: number;
  healing: number;
  shielding: number;
  tanking: number;
  cc: number;
}

export function buildTraitTable(games: GameRecord[]): TraitTable {
  const totals = new Map<number, Totals>();
  for (const game of games) {
    const minutes = game.duration / 60;
    for (const p of game.players) {
      if (!p.stats) continue;
      const [physical, magic, trueDmg, selfHeal, allyHeal, shields, mitigated, taken, cc] = p.stats as number[];
      const t = totals.get(p.champ) ?? { games: 0, physical: 0, magic: 0, true: 0, healing: 0, shielding: 0, tanking: 0, cc: 0 };
      t.games++;
      t.physical += physical!;
      t.magic += magic!;
      t.true += trueDmg!;
      t.healing += (selfHeal! + allyHeal!) / minutes;
      t.shielding += shields! / minutes;
      t.tanking += (mitigated! + taken!) / minutes;
      t.cc += cc! / minutes;
      totals.set(p.champ, t);
    }
  }
  const seen = [...totals].filter(([, t]) => t.games >= MIN_GAMES);
  const average = (t: Totals, key: 'healing' | 'shielding' | 'tanking' | 'cc') => t[key] / t.games;
  // The value of the first champion outside the top share; a trait needs strictly more, so ties
  // at the edge don't pull in a crowd of ordinary champions.
  const cutoff = (key: 'healing' | 'shielding' | 'tanking' | 'cc', share: number) => {
    const values = seen.map(([, t]) => average(t, key)).sort((a, b) => b - a);
    return values[Math.max(1, Math.floor(values.length * share))] ?? -Infinity;
  };
  const cut = {
    healer: cutoff('healing', TOP_SHARE.healer),
    tank: cutoff('tanking', TOP_SHARE.tank),
    shielder: cutoff('shielding', TOP_SHARE.shielder),
    cc: cutoff('cc', TOP_SHARE.cc),
  };

  const table: TraitTable = {};
  for (const [id, t] of seen) {
    const damage = t.physical + t.magic + t.true || 1;
    const traits: ChampionTrait[] = [];
    if (t.magic / damage >= DAMAGE_SHARE) traits.push('ap');
    if (t.physical / damage >= DAMAGE_SHARE) traits.push('ad');
    if (average(t, 'healing') > cut.healer) traits.push('healer');
    if (average(t, 'tanking') > cut.tank) traits.push('tank');
    if (average(t, 'shielding') > cut.shielder) traits.push('shielder');
    if (average(t, 'cc') > cut.cc) traits.push('cc');
    table[id] = traits;
  }
  return table;
}

/**
 * Traits of a matchup from one player's point of view, from champions alone, so the app can
 * compute the same thing from champ select.
 */
export function matchupTraits(table: TraitTable, allies: number[], enemies: number[]): Set<Trait> {
  const count = (champs: number[], trait: ChampionTrait) => champs.filter((c) => table[c]?.includes(trait)).length;
  const traits = new Set<Trait>();
  if (count(enemies, 'healer') >= 1) traits.add('enemy-heavy-healing');
  if (count(enemies, 'tank') >= 2) traits.add('enemy-tanks-2plus');
  if (count(enemies, 'ap') >= 3) traits.add('enemy-mostly-ap');
  if (count(enemies, 'ad') >= 3) traits.add('enemy-mostly-ad');
  if (count(enemies, 'cc') >= 2) traits.add('enemy-heavy-cc');
  if (count(enemies, 'shielder') >= 1) traits.add('enemy-shields');
  if (allies.length > 0 && count(allies, 'tank') === 0) traits.add('ally-no-frontline');
  if (allies.length > 0 && count(allies, 'ap') === 0) traits.add('ally-no-ap');
  return traits;
}
