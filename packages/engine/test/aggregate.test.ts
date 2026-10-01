import { describe, expect, it } from 'vitest';
import type { GamePlayer } from '@hexcards/data';
import {
  ItemCatalog, buildVariants, chooseClusters, cosineDistance, labelFor, skillOrderOf, toBuildGame, validateSkillOrder,
  type BuildGame, type DDragonItem, PROFILE_TAGS,
} from '../src';
import { styles } from './fixtures';

const item = (name: string, total: number, tags: string[], extra: Partial<DDragonItem> = {}): DDragonItem => ({
  name, gold: { total, purchasable: true }, tags, into: [], depth: 3, ...extra,
});

// A tiny item catalog with real IDs.
const items = new ItemCatalog({
  1055: item("Doran's Blade", 450, ['Damage', 'Lane'], { depth: 1 }),
  2003: item('Health Potion', 50, ['Consumable'], { depth: 1 }),
  3340: item('Stealth Ward', 0, ['Trinket', 'Vision'], { depth: 1 }),
  1036: item('Long Sword', 350, ['Damage'], { into: ['3078'], depth: 1 }),
  3078: item('Trinity Force', 3333, ['Health', 'Damage', 'AttackSpeed', 'OnHit', 'AbilityHaste']),
  6610: item('Sundered Sky', 3100, ['Health', 'Damage', 'AbilityHaste']),
  3053: item("Sterak's Gage", 3200, ['Health', 'Damage']),
  3089: item("Rabadon's Deathcap", 3500, ['SpellDamage']),
  4645: item('Shadowflame', 3200, ['SpellDamage', 'MagicPenetration']),
  3157: item("Zhonya's Hourglass", 3250, ['SpellDamage', 'Armor']),
  3142: item("Youmuu's Ghostblade", 2800, ['Damage', 'ArmorPenetration'], { description: '<stats>55 Attack Damage<br>18 Lethality</stats>' }),
  3071: item('Black Cleaver', 3000, ['Health', 'Damage', 'ArmorPenetration']),
  3047: item('Plated Steelcaps', 1200, ['Armor', 'Boots'], { depth: 2 }),
  1001: item('Boots', 300, ['Boots'], { into: ['3047'], depth: 1 }),
});

const JAX_SKILLS = 'EQWWWRWEWEREEQQRQQ';
const bruiserPage = { p: 8000, s: 8400, ids: [8010, 9111, 9104, 8299, 8444, 8242, 5005, 5008, 5011] };

const player = (core: number[], win: 0 | 1, overrides: Partial<GamePlayer> = {}): GamePlayer => ({
  champ: 24, team: 100, pos: 'TOP', win, runes: bruiserPage, spells: [12, 4], skills: JAX_SKILLS,
  buys: [[1055, 5], [2003, 6], [3340, 1], [1036, 400], [1001, 405], ...core.map((id, i): [number, number] => [id, 600 + i * 420]), [3047, 900]],
  ...overrides,
});

describe('toBuildGame', () => {
  it('splits a game into start, first back, finished items and boots', () => {
    const g = toBuildGame(player([3078, 6610, 3053], 1), items);
    expect(g.start).toEqual([1055, 2003]); // the trinket isn't a starting purchase
    expect(g.firstBack).toEqual([1036, 1001]);
    expect(g.legendaries.map((l) => l.id)).toEqual([3078, 6610, 3053]);
    expect(g.legendaries[0]!.minute).toBe(10);
    expect(g.boots).toBe(3047);
  });
});

describe('labelFor', () => {
  const profile = (ids: number[]) => Object.fromEntries(PROFILE_TAGS.map((t) => [t, ids.reduce((s, id) => s + items.profile(id)[t], 0) / ids.length])) as never;
  it('names builds by what their items do', () => {
    expect(labelFor(profile([3078, 6610, 3053]))).toBe('Bruiser');
    expect(labelFor(profile([3089, 4645, 3157]))).toBe('AP');
    expect(labelFor(profile([3142, 3142, 3071]))).toBe('Lethality');
  });
  it('does not call Black Cleaver lethality', () => {
    expect(items.profile(3071).Lethality).toBe(0);
    expect(items.profile(3142).Lethality).toBe(1);
  });
});

describe('skillOrderOf', () => {
  it('follows the most common order and stays legal', () => {
    const order = skillOrderOf([...Array(30).fill(JAX_SKILLS), ...Array(5).fill('QEWQQRQWQWRWWEEREE')]);
    expect(order?.join('')).toBe(JAX_SKILLS);
    expect(validateSkillOrder(order!)).toEqual([]);
  });
  it('finishes short games by the rules', () => {
    const order = skillOrderOf(Array(30).fill(JAX_SKILLS.slice(0, 11)));
    expect(order?.slice(0, 11).join('')).toBe(JAX_SKILLS.slice(0, 11));
    expect(validateSkillOrder(order!)).toEqual([]);
  });
});

describe('clustering', () => {
  it('keeps one cluster when every game builds the same way', () => {
    const points = Array.from({ length: 60 }, () => [1, 1, 0, 0]);
    expect(new Set(chooseClusters(points)).size).toBe(1);
  });
  it('separates two clearly different builds', () => {
    const points = [...Array.from({ length: 40 }, () => [1, 1, 0, 0]), ...Array.from({ length: 40 }, () => [0, 0, 1, 1])];
    const labels = chooseClusters(points);
    expect(new Set(labels).size).toBe(2);
    expect(new Set(labels.slice(0, 40)).size).toBe(1);
    expect(cosineDistance([1, 0], [0, 1])).toBe(1);
  });
});

describe('buildVariants', () => {
  const ad = Array.from({ length: 60 }, (_, i) => toBuildGame(player([3078, 6610, 3053], i % 2 ? 1 : 0), items));
  const ap = Array.from({ length: 40 }, (_, i) => toBuildGame(player([3089, 4645, 3157], i % 4 ? 1 : 0), items));

  it('finds a bruiser and an AP build with their own items and win rates', () => {
    const variants = buildVariants([...ad, ...ap], { items, styles, championName: 'Jax' });
    expect(variants.map((v) => v.label)).toEqual(['Jax Bruiser', 'Jax AP']);
    const [bruiser, apBuild] = variants;
    expect(bruiser!.stats).toEqual({ games: 60, pickShare: 0.6, winRate: 0.5 });
    expect(apBuild!.stats.winRate).toBe(0.75);
    expect(bruiser!.slots.find((s) => s.slot === 'core-1')!.common[0]!.itemId).toBe(3078);
    expect(apBuild!.slots.find((s) => s.slot === 'core-1')!.common[0]!.itemId).toBe(3089);
    expect(bruiser!.spells).toEqual([4, 12]); // Flash first
    expect(bruiser!.runes.perkIds).toEqual(bruiserPage.ids);
  });

  it('never publishes an invalid rune page', () => {
    // Every game uses a page with two secondaries from the same row.
    const broken = { p: 8000, s: 8400, ids: [8010, 9111, 9104, 8299, 8444, 8473, 5005, 5008, 5011] };
    const games: BuildGame[] = Array.from({ length: 50 }, () => toBuildGame(player([3078, 6610, 3053], 1, { runes: broken }), items));
    expect(buildVariants(games, { items, styles, championName: 'Jax' })).toEqual([]);
  });
});
