import { TRAIT_LABELS } from '@hexcards/data';
import type { BuildVariant, ChampionBuilds, LcuItemSet, LcuItemSetBlock, LcuItemSetsDoc, Slot, Swap } from '@hexcards/data';

const SUMMONERS_RIFT = 11;
const CORE_SLOTS: Slot[] = ['core-1', 'core-2', 'core-3'];
const LATE_SLOTS: Slot[] = ['late-4', 'late-5', 'late-6'];

/** Prefix of every item set uid Hex Cards writes for a champion. */
export const itemSetUidPrefix = (championId: number) => `hexcards-${championId}-`;

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
    ...activeSwaps.map((s) => block(`Swap ${TRAIT_LABELS[s.trigger]}`, [...s.earlyComponents, s.itemId])),
    block('Core', CORE_SLOTS.map(defaultItem).filter((id): id is number => id !== undefined)),
    block('Boots', common('boots').map((c) => c.itemId)),
    block('Late game', LATE_SLOTS.flatMap((slot) => common(slot).map((c) => c.itemId))),
    block('Core alternatives', CORE_SLOTS.flatMap((slot) => common(slot).slice(1).map((c) => c.itemId))),
    block('Other swaps', inactiveSwaps.map((s) => s.itemId)),
  ].filter((b): b is LcuItemSetBlock => b !== null);

  return {
    uid: itemSetUidPrefix(champion.championId) + variant.id,
    title: `HexCards: ${variant.label}`,
    type: 'custom',
    map: 'SR',
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
  const prefix = itemSetUidPrefix(championId);
  return {
    accountId: doc.accountId,
    timestamp: now,
    itemSets: [...doc.itemSets.filter((s) => !s.uid?.startsWith(prefix)), ...ours],
  };
}
