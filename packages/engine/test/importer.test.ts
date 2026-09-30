import { describe, expect, it } from 'vitest';
import type { LcuItemSet, LcuPerkPage } from '@hexcards/data';
import { ImportError, importItemSets, importRunes, importSpells } from '../src';
import { FakeLcu } from './fakeLcu';
import { jaxTop } from './fixtures';

const bruiser = jaxTop.variants[0]!;
const userPage = (id: number, name: string): LcuPerkPage => ({
  id, name, primaryStyleId: 8100, subStyleId: 8000, selectedPerkIds: [8112, 8126, 8137, 8135, 9111, 8299, 5008, 5008, 5011],
  current: false, isEditable: true, isDeletable: true,
});

describe('importRunes', () => {
  it('creates a Hex Cards page and selects it, leaving user pages alone', async () => {
    const lcu = new FakeLcu({ pages: [userPage(1, 'My Zed'), userPage(2, 'My Ahri')] });
    const before = structuredClone(lcu.pages);
    const result = await importRunes(lcu, bruiser);
    expect(result.kind).toBe('done');
    expect(lcu.pages.slice(0, 2)).toEqual(before);
    const ours = lcu.pages[2]!;
    expect(ours.name).toBe('HexCards: Jax Bruiser');
    expect(ours.selectedPerkIds).toEqual(bruiser.runes.perkIds);
    expect(lcu.currentPageId).toBe(ours.id);
  });

  it('updates the existing Hex Cards page on the next import', async () => {
    const lcu = new FakeLcu({ pages: [userPage(1, 'My Zed')] });
    const first = await importRunes(lcu, bruiser);
    const second = await importRunes(lcu, jaxTop.variants[1]!);
    expect(second).toEqual(first.kind === 'done' ? { kind: 'done', pageId: first.pageId } : null);
    expect(lcu.pages).toHaveLength(2);
    expect(lcu.pages[1]!.name).toBe('HexCards: Jax On-hit');
  });

  it('asks which page to replace when at the limit, and changes nothing', async () => {
    const lcu = new FakeLcu({ pages: [userPage(1, 'My Zed'), userPage(2, 'My Ahri')], ownedPageCount: 2 });
    const before = structuredClone(lcu.pages);
    const result = await importRunes(lcu, bruiser);
    expect(result.kind).toBe('choose');
    expect(lcu.pages).toEqual(before);
    expect(lcu.calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
  });

  it('replaces only the page the user picked', async () => {
    const lcu = new FakeLcu({ pages: [userPage(1, 'My Zed'), userPage(2, 'My Ahri')], ownedPageCount: 2 });
    await importRunes(lcu, bruiser, { replacePageId: 2 });
    expect(lcu.pages[0]!.name).toBe('My Zed');
    expect(lcu.pages[1]!.name).toBe('HexCards: Jax Bruiser');
  });

  it('sends nothing when the page is invalid for this patch', async () => {
    const lcu = new FakeLcu();
    const broken = { ...bruiser, runes: { ...bruiser.runes, perkIds: [8010, 9111, 9104, 8299, 8444, 8473, 5005, 5008, 5011] } };
    await expect(importRunes(lcu, broken)).rejects.toBeInstanceOf(ImportError);
    expect(lcu.calls).toEqual(['GET /lol-perks/v1/styles']);
  });

  it('never sends a DELETE', async () => {
    const lcu = new FakeLcu({ pages: [userPage(1, 'My Zed')] });
    await importRunes(lcu, bruiser);
    await importRunes(lcu, bruiser);
    expect(lcu.calls.some((c) => c.startsWith('DELETE'))).toBe(false);
  });
});

describe('importItemSets', () => {
  it("writes one set per variant under the summoner ID and keeps the user's sets", async () => {
    const mine = { uid: 'abc-user', title: 'My Jax' } as LcuItemSet;
    const lcu = new FakeLcu({ itemSets: [mine] });
    await importItemSets(lcu, jaxTop, (v) => (v.id === 'bruiser' ? [v.swaps[0]!] : []));
    expect(lcu.itemSets.map((s) => s.uid)).toEqual(['abc-user', 'hexcards-24-bruiser', 'hexcards-24-on-hit']);
    expect(lcu.itemSets[0]).toEqual(mine);
    const core = lcu.itemSets[1]!.blocks.find((b) => b.type === 'Core')!;
    expect(core.items.map((i) => i.id)).toEqual(['3078', '6610', '6609']);
  });

  it('replaces its own sets instead of duplicating them', async () => {
    const lcu = new FakeLcu();
    await importItemSets(lcu, jaxTop, () => []);
    await importItemSets(lcu, jaxTop, () => []);
    expect(lcu.itemSets).toHaveLength(2);
  });
});

describe('importSpells', () => {
  it('keeps Flash on D', async () => {
    const lcu = new FakeLcu();
    await importSpells(lcu, [12, 4], 'D');
    expect(lcu.selection).toEqual({ spell1Id: 4, spell2Id: 12 });
  });

  it('keeps Flash on F', async () => {
    const lcu = new FakeLcu();
    await importSpells(lcu, [4, 12], 'F');
    expect(lcu.selection).toEqual({ spell1Id: 12, spell2Id: 4 });
  });

  it('leaves order alone when the build has no Flash', async () => {
    const lcu = new FakeLcu();
    await importSpells(lcu, [6, 12], 'F');
    expect(lcu.selection).toEqual({ spell1Id: 6, spell2Id: 12 });
  });
});
