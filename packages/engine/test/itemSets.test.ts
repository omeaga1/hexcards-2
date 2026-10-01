import { describe, expect, it } from 'vitest';
import type { LcuItemSet, LcuItemSetsDoc } from '@hexcards/data';
import { buildItemSet, itemSetUid, mergeItemSets } from '../src';

import { jaxTop } from './fixtures';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const bruiser = jaxTop.variants[0]!;
const ids = (set: LcuItemSet, blockType: string) => set.blocks.find((b) => b.type === blockType)?.items.map((i) => Number(i.id));

describe('buildItemSet', () => {
  it('lists the default core path and puts alternatives in their own block', () => {
    const set = buildItemSet(jaxTop, bruiser);
    expect(set.uid).toMatch(UUID);
    expect(set.uid).toBe(itemSetUid(24, 'bruiser'));
    expect(set.map).toBe('any');
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
  const otherChampion = { uid: itemSetUid(103, 'burst'), title: 'HexCards: Ahri Burst', associatedChampions: [103] } as LcuItemSet;
  const oldOurs = { uid: 'hexcards-24-old', title: 'HexCards: old', associatedChampions: [24] } as LcuItemSet;
  const doc: LcuItemSetsDoc = { accountId: 42, timestamp: 1, itemSets: [userSet, otherChampion, oldOurs] };

  it("keeps the user's sets untouched and replaces only this champion's Hex Cards sets", () => {
    const fresh = buildItemSet(jaxTop, bruiser);
    const merged = mergeItemSets(doc, 24, [fresh], 99);
    expect(merged.itemSets).toEqual([userSet, otherChampion, fresh]);
    expect(merged.itemSets[0]).toBe(userSet);
    expect(merged.accountId).toBe(42);
    expect(merged.timestamp).toBe(99);
  });

  it('keeps a user set that only borrows our title but covers other champions', () => {
    const shared = { uid: 'abc', title: 'HexCards: my notes', associatedChampions: [24, 103] } as LcuItemSet;
    const merged = mergeItemSets({ accountId: 1, timestamp: 1, itemSets: [shared] }, 24, []);
    expect(merged.itemSets).toEqual([shared]);
  });
});

describe('itemSetUid', () => {
  it('is a stable, well-formed UUID that differs per champion and build', () => {
    expect(itemSetUid(24, 'bruiser')).toMatch(UUID);
    expect(itemSetUid(24, 'bruiser')).toBe(itemSetUid(24, 'bruiser'));
    expect(new Set([itemSetUid(24, 'bruiser'), itemSetUid(24, 'on-hit'), itemSetUid(25, 'bruiser')]).size).toBe(3);
  });
});
