// One collected game, as written by pipeline/src/collect.mjs (one JSON object per line).

export type Position = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export interface GamePlayer {
  champ: number;
  team: 100 | 200;
  pos: Position;
  win: 0 | 1;
  /** Primary tree, secondary tree, and the 9 perk IDs in client order. */
  runes: { p: number; s: number; ids: number[] } | null;
  spells: [number, number];
  /** Ability leveled at each level, e.g. "QEWQQRQ...". */
  skills: string;
  /** [itemId, seconds into the game], undone purchases removed. */
  buys: [number, number][];
  /**
   * Present on games collected after the stats field was added:
   * [physical, magic, true damage to champions, self healing, healing on allies,
   *  shields on allies, damage mitigated, damage taken, seconds of CC on enemies]
   */
  stats?: number[];
}

export interface GameRecord {
  id: string;
  region: string;
  version: string;
  duration: number;
  bans: number[];
  players: GamePlayer[];
}
