import { describe, expect, it } from 'vitest';
import type { LcuItemSet, LcuItemSetsDoc } from '@hexcards/data';
import { buildItemSet, mergeItemSets } from '../src';
import { jaxTop } from './fixtures';

const bruiser = jaxTop.variants[0]!;
const ids = (set: LcuItemSet, blockType: string) => set.blocks.find((b) => b.type === blockType)?.items.map((i) => Number(i.id));

describe('buildItemSet', () => {
  it('lists the default core path and puts alternatives in their own block', () => {
    const set = buildItemSet(jaxTop, bruiser);
    expect(set.uid).toBe('hexcards-24-bruiser');
    expect(set.associatedChampions).toEqual([24]);
    expect(ids(set, 'Core')).toEqual([3078, 6610, 6333]);
    expect(ids(set, 'Core alternatives')).toEqual([6631, 3053, 3071]);
    expect(ids(set, 'Other swaps')).toEqual([6609, 3065]);
  });

  it('applies an active swap to its slot and adds a timed swap block', () => {
    const antiHeal = bruiser.swaps[0]!;
    const set = buildItemSet(jaxTop, bruiser, [antiHeal]);
    expect(ids(set, 'Core')).toEqual([3078, 6610, 6609]);
    expect(ids(set, 'Swap vs heavy healing')).toEqual([3123, 6609]);
    expect(ids(set, 'Other swaps')).toEqual([3065]);
  });

  it('writes item IDs as strings with no duplicates within a block', () => {
    const set = buildItemSet(jaxTop, bruiser);
    for (const block of set.blocks) {
      const blockIds = block.items.map((i) => i.id);
      expect(new Set(blockIds).size).toBe(blockIds.length);
      blockIds.forEach((id) => expect(typeof id).toBe('string'));
    }
  });
});

describe('mergeItemSets', () => {
  const userSet = { uid: 'user-made-1', title: 'My Jax' } as LcuItemSet;
  const otherChampion = { uid: 'hexcards-103-burst', title: 'HexCards: Ahri Burst' } as LcuItemSet;
  const oldOurs = { uid: 'hexcards-24-old', title: 'HexCards: old' } as LcuItemSet;
  const doc: LcuItemSetsDoc = { accountId: 42, timestamp: 1, itemSets: [userSet, otherChampion, oldOurs] };

  it("keeps the user's sets untouched and replaces only this champion's Hex Cards sets", () => {
    const fresh = buildItemSet(jaxTop, bruiser);
    const merged = mergeItemSets(doc, 24, [fresh], 99);
    expect(merged.itemSets).toEqual([userSet, otherChampion, fresh]);
    expect(merged.itemSets[0]).toBe(userSet);
    expect(merged.accountId).toBe(42);
    expect(merged.timestamp).toBe(99);
  });
});
