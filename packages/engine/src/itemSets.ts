import { traitClause } from '@hexcards/data';
import type { BuildVariant, ChampionBuilds, LcuItemSet, LcuItemSetBlock, LcuItemSetsDoc, Slot, Swap } from '@hexcards/data';

const SUMMONERS_RIFT = 11;
const CORE_SLOTS: Slot[] = ['core-1', 'core-2', 'core-3'];
const LATE_SLOTS: Slot[] = ['late-4', 'late-5', 'late-6'];

export const ITEM_SET_TITLE_PREFIX = 'HexCards: ';

/**
 * A stable uid in the UUID format the client uses for every item set; it skips sets whose uid
 * isn't a UUID. The same champion and build always get the same uid, so re-importing replaces the
 * set instead of adding another. Not cryptographic: four FNV-1a passes over the name.
 */
export function itemSetUid(championId: number, variantId: string): string {
  const name = `hexcards:${championId}:${variantId}`;
  let hex = '';
  for (let seed = 0; seed < 4; seed++) {
    let h = 0x811c9dc5 ^ seed;
    for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
    hex += (h >>> 0).toString(16).padStart(8, '0');
  }
  // Version 8 ("custom") and the RFC 9562 variant bits, so it's a well-formed UUID.
  const v = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${v}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Hex Cards' own sets for this champion: our uid format, or our title on a set tied to only this champion. */
function isOurs(set: LcuItemSet, championId: number, ourUids: Set<string>): boolean {
  if (ourUids.has(set.uid)) return true;
  // Sets from Hex Cards 1.0 and the first 2.0 builds used other uids but always carried our title.
  return set.title?.startsWith(ITEM_SET_TITLE_PREFIX) === true && set.associatedChampions?.length === 1 && set.associatedChampions[0] === championId;
}

function block(type: string, itemIds: number[]): LcuItemSetBlock | null {
  const unique = [...new Set(itemIds)];
  if (unique.length === 0) return null;
  return {
    type,
    hideIfSummonerSpell: '',
    showIfSummonerSpell: '',
    items: unique.map((id) => ({ id: String(id), count: 1 })),
  };
}

/**
 * One in-game shop item set for a build variant. Swaps whose trigger matches this
 * game (`activeSwaps`) replace their slot in Core and get their own block first.
 */
export function buildItemSet(champion: ChampionBuilds, variant: BuildVariant, activeSwaps: Swap[] = []): LcuItemSet {
  const common = (slot: Slot) => variant.slots.find((s) => s.slot === slot)?.common ?? [];
  const defaultItem = (slot: Slot) => activeSwaps.find((s) => s.replacesSlot === slot)?.itemId ?? common(slot)[0]?.itemId;
  const inactiveSwaps = variant.swaps.filter((s) => !activeSwaps.includes(s));

  const blocks = [
    block('Start', common('start').map((c) => c.itemId)),
    block('First back', common('first-back').map((c) => c.itemId)),
    ...activeSwaps.map((s) => block(`Swap ${traitClause(s.trigger)}`, [...s.earlyComponents, s.itemId])),
    block('Core', CORE_SLOTS.map(defaultItem).filter((id): id is number => id !== undefined)),
    block('Boots', common('boots').map((c) => c.itemId)),
    block('Late game', LATE_SLOTS.flatMap((slot) => common(slot).map((c) => c.itemId))),
    block('Core alternatives', CORE_SLOTS.flatMap((slot) => common(slot).slice(1).map((c) => c.itemId))),
    block('Other swaps', inactiveSwaps.map((s) => s.itemId)),
  ].filter((b): b is LcuItemSetBlock => b !== null);

  return {
    uid: itemSetUid(champion.championId, variant.id),
    title: `${ITEM_SET_TITLE_PREFIX}${variant.label}`,
    type: 'custom',
    // Every set the client itself saves uses "any" with the maps listed in associatedMaps.
    map: 'any',
    mode: 'any',
    sortrank: 0,
    startedFrom: 'blank',
    associatedChampions: [champion.championId],
    associatedMaps: [SUMMONERS_RIFT],
    preferredItemSlots: [],
    blocks,
  };
}

/**
 * Replaces this champion's Hex Cards item sets and keeps every other set exactly as it was,
 * including all of the user's own sets.
 */
export function mergeItemSets(doc: LcuItemSetsDoc, championId: number, ours: LcuItemSet[], now = Date.now()): LcuItemSetsDoc {
  const ourUids = new Set(ours.map((s) => s.uid));
  return {
    accountId: doc.accountId,
    timestamp: now,
    itemSets: [...doc.itemSets.filter((s) => !isOurs(s, championId, ourUids)), ...ours],
  };
}
