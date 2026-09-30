// Shapes of the League Client (LCU) endpoints Hex Cards reads and writes.
// Only the fields we use are typed; the client sends more.

/** One rune tree from `GET /lol-perks/v1/styles`. */
export interface PerkStyle {
  id: number;
  name: string;
  allowedSubStyles: number[];
  slots: PerkSlot[];
}

export interface PerkSlot {
  /** `kKeyStone`, `kMixedRegularSplashable` (the three minor rows) or `kStatMod` (the three shard rows). */
  type: 'kKeyStone' | 'kMixedRegularSplashable' | 'kStatMod' | (string & {});
  slotLabel: string;
  perks: number[];
}

/** A rune page from `GET /lol-perks/v1/pages`. */
export interface LcuPerkPage {
  id: number;
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  current: boolean;
  isEditable: boolean;
  isDeletable: boolean;
}

/** `GET /lol-perks/v1/inventory` */
export interface LcuPerkInventory {
  ownedPageCount: number;
}

/** Body for `POST /lol-perks/v1/pages` and `PUT /lol-perks/v1/pages/{id}`. */
export interface LcuPerkPageWrite {
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  current: boolean;
}

/** One item set inside `GET/PUT /lol-item-sets/v1/item-sets/{summonerId}/sets`. */
export interface LcuItemSet {
  uid: string;
  title: string;
  type: string;
  map: string;
  mode: string;
  sortrank: number;
  startedFrom: string;
  associatedChampions: number[];
  associatedMaps: number[];
  preferredItemSlots: unknown[];
  blocks: LcuItemSetBlock[];
}

export interface LcuItemSetBlock {
  type: string;
  hideIfSummonerSpell: string;
  showIfSummonerSpell: string;
  items: { id: string; count: number }[];
}

/** Whole document for `GET/PUT /lol-item-sets/v1/item-sets/{summonerId}/sets`. */
export interface LcuItemSetsDoc {
  accountId: number;
  timestamp: number;
  itemSets: LcuItemSet[];
}
