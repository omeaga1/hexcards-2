import { describe, expect, it } from 'vitest';
import type { LcuPerkPage } from '@hexcards/data';
import { PAGE_PREFIX, planRunePageWrite, toLcuPerkPage, validateRunePage } from '../src';
import { conquerorPage, styles } from './fixtures';

const withPerks = (perkIds: number[], subStyleId = conquerorPage.subStyleId) => ({ ...conquerorPage, subStyleId, perkIds });

describe('validateRunePage', () => {
  it('accepts a valid page', () => {
    expect(validateRunePage(conquerorPage, styles)).toEqual({ ok: true });
  });

  it('rejects a secondary rune from the wrong tree (the 1.0 fallback bug)', () => {
    // Domination secondary with Second Wind (Resolve) in it.
    const page = withPerks([8010, 9111, 9104, 8299, 8444, 8135, 5005, 5008, 5011], 8100);
    const result = validateRunePage(page, styles);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' ')).toContain('8444');
  });

  it('rejects two secondaries from the same row', () => {
    // Second Wind and Bone Plating are both in Resolve's second row.
    const result = validateRunePage(withPerks([8010, 9111, 9104, 8299, 8444, 8473, 5005, 5008, 5011]), styles);
    expect(!result.ok && result.errors.join(' ')).toMatch(/same Resolve row/);
  });

  it('rejects a keystone from another tree', () => {
    const result = validateRunePage(withPerks([8112, 9111, 9104, 8299, 8444, 8242, 5005, 5008, 5011]), styles);
    expect(result.ok).toBe(false);
  });

  it('rejects primary runes in the wrong row', () => {
    const result = validateRunePage(withPerks([8010, 9104, 9111, 8299, 8444, 8242, 5005, 5008, 5011]), styles);
    expect(result.ok).toBe(false);
  });

  it('rejects a shard in the wrong shard row', () => {
    // Tenacity (5013) is only valid in the defense row.
    const result = validateRunePage(withPerks([8010, 9111, 9104, 8299, 8444, 8242, 5013, 5008, 5011]), styles);
    expect(!result.ok && result.errors.join(' ')).toMatch(/shard row 1/);
  });

  it('rejects removed runes such as Ghost Poro (8120)', () => {
    const page = { primaryStyleId: 8100, subStyleId: 8000, perkIds: [8112, 8126, 8120, 8135, 9111, 8299, 5008, 5008, 5011] };
    expect(validateRunePage(page, styles).ok).toBe(false);
  });

  it('rejects same primary and secondary tree', () => {
    expect(validateRunePage(withPerks(conquerorPage.perkIds, 8000), styles).ok).toBe(false);
  });
});

describe('toLcuPerkPage', () => {
  it('names the page with our prefix and keeps it within the client limit', () => {
    const page = toLcuPerkPage(conquerorPage, 'Jax Bruiser Top With A Long Label');
    expect(page.name.startsWith(PAGE_PREFIX)).toBe(true);
    expect(page.name.length).toBeLessThanOrEqual(30);
    expect(page.selectedPerkIds).toEqual(conquerorPage.perkIds);
    expect(page.current).toBe(true);
  });
});

describe('planRunePageWrite', () => {
  const page = (id: number, name: string, custom = true): LcuPerkPage => ({
    id, name, primaryStyleId: 8000, subStyleId: 8400, selectedPerkIds: [], current: false,
    isEditable: custom, isDeletable: custom,
  });
  const userPages = [page(1, 'My Jax'), page(2, 'My Ahri'), page(50, 'Preset', false)];

  it('updates the page we created, by saved ID', () => {
    const pages = [...userPages, page(7, 'HexCards: Jax Bruiser')];
    expect(planRunePageWrite(pages, { ownedPageCount: 5 }, 7)).toEqual({ kind: 'update', pageId: 7 });
  });

  it('finds our page by name when the saved ID is gone', () => {
    const pages = [...userPages, page(9, 'HexCards: Ahri Burst')];
    expect(planRunePageWrite(pages, { ownedPageCount: 5 }, 7)).toEqual({ kind: 'update', pageId: 9 });
  });

  it('creates a page when there is room, and never takes a user page', () => {
    expect(planRunePageWrite(userPages, { ownedPageCount: 5 })).toEqual({ kind: 'create' });
  });

  it('asks the user when at the page limit', () => {
    const plan = planRunePageWrite(userPages, { ownedPageCount: 2 });
    expect(plan.kind).toBe('choose');
    expect(plan.kind === 'choose' && plan.candidates.map((p) => p.id)).toEqual([1, 2]);
  });
});
