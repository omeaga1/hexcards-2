import { describe, expect, it } from 'vitest';
import type { GameRecord } from '@hexcards/data';
import { ItemCatalog, buildTraitTable, findSwaps, matchupTraits, swapCandidates, type BuildGame, type DDragonItem } from '../src';

const item = (name: string, tags: string[], description = ''): DDragonItem => ({
  name, description, gold: { total: 3000, purchasable: true }, tags, into: [], depth: 3, maps: { 11: true },
});

const items = new ItemCatalog({
  3033: item('Mortal Reminder', ['Damage', 'CriticalStrike'], 'Attacks apply <status>Grievous Wounds</status>'),
  3036: item("Lord Dominik's Regards", ['Damage', 'CriticalStrike', 'ArmorPenetration'], '35% Armor Penetration'),
  3142: item("Youmuu's Ghostblade", ['Damage', 'ArmorPenetration'], '18 Lethality'),
  3156: item('Maw of Malmortius', ['Damage', 'SpellBlock']),
  3031: item('Infinity Edge', ['Damage', 'CriticalStrike']),
  3140: item('Mercurial Scimitar', ['Damage', 'SpellBlock', 'Tenacity'], 'removes all crowd control'),
});

describe('ItemCatalog.counters', () => {
  it('reads what an item answers from Riot item data', () => {
    expect([...items.counters(3033)]).toEqual(['enemy-heavy-healing']);
    expect(items.counters(3036).has('enemy-tanks-2plus')).toBe(true);
    expect(items.counters(3142).has('enemy-tanks-2plus')).toBe(false); // lethality is for squishies
    expect(items.counters(3156).has('enemy-mostly-ap')).toBe(true);
    expect(items.counters(3140).has('enemy-heavy-cc')).toBe(true);
    expect(items.counters(3031).size).toBe(0);
  });
});

describe('champion and matchup traits', () => {
  // Champion 1 heals a lot, 2 tanks a lot, 3 deals magic damage, 4-12 are ordinary.
  const player = (champ: number, stats: number[]) => ({ champ, team: 100, pos: 'TOP', win: 1, runes: null, spells: [4, 12], skills: '', buys: [], stats });
  const ordinary = [3000, 1000, 0, 100, 0, 0, 3000, 3000, 5];
  const game = (): GameRecord => ({
    id: 'x', region: 'na1', version: '16.19.1', duration: 1800, bans: [],
    players: [
      player(1, [3000, 1000, 0, 20000, 5000, 0, 3000, 3000, 5]),
      player(2, [2000, 500, 0, 100, 0, 0, 40000, 30000, 30]),
      player(3, [200, 9000, 100, 100, 0, 0, 3000, 3000, 5]),
      ...Array.from({ length: 9 }, (_, i) => player(4 + i, ordinary)),
    ] as unknown as GameRecord['players'],
  });
  const table = buildTraitTable(Array.from({ length: 20 }, game));

  it('marks champions by what they actually do', () => {
    expect(table[1]).toContain('healer');
    expect(table[2]).toContain('tank');
    expect(table[3]).toContain('ap');
    expect(table[4]).not.toContain('healer');
  });

  it('tags a matchup from champions alone', () => {
    const traits = matchupTraits(table, [4, 5, 6, 7], [1, 2, 8, 9, 10]);
    expect(traits.has('enemy-heavy-healing')).toBe(true);
    expect(traits.has('enemy-tanks-2plus')).toBe(false);
    expect(traits.has('ally-no-frontline')).toBe(true);
  });
});

describe('findSwaps', () => {
  const game = (core: number[], win: boolean, healing: boolean): BuildGame => ({
    win, runes: null, spells: [4, 7], skills: '', start: [], firstBack: [], boots: null,
    legendaries: core.map((id, i) => ({ id, minute: 10 + i * 8 })),
    buys: core.map((id, i): [number, number] => [id, (10 + i * 8) * 60]),
    traits: new Set(healing ? ['enemy-heavy-healing'] : []),
  });
  const slots = [{ slot: 'core-3' as const, common: [{ itemId: 3031, share: 0.8 }] }];

  it('finds an anti-heal swap that players buy more against healing and win with', () => {
    const games = [
      ...Array.from({ length: 50 }, (_, i) => game([3036, 3156, 3033], i < 30, true)), // buy Mortal Reminder, win 60%
      ...Array.from({ length: 40 }, (_, i) => game([3036, 3156, 3031], i < 18, true)), // don't, win 45%
      ...Array.from({ length: 100 }, (_, i) => game([3036, 3156, 3031], i < 50, false)),
    ];
    const swaps = findSwaps(games, slots, items);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]).toMatchObject({ itemId: 3033, trigger: 'enemy-heavy-healing', replacesSlot: 'core-3' });
    expect(swaps[0]!.evidence.games).toBe(50);
    expect(swaps[0]!.timing).toMatch(/3rd item, around minute 26/);
  });

  it('ignores items that do not answer the trigger, however often they are bought', () => {
    const games = [
      ...Array.from({ length: 50 }, (_, i) => game([3036, 3156, 3142], i < 30, true)),
      ...Array.from({ length: 40 }, (_, i) => game([3036, 3156, 3031], i < 18, true)),
      ...Array.from({ length: 100 }, (_, i) => game([3036, 3156, 3031], i < 50, false)),
    ];
    expect(findSwaps(games, slots, items)).toEqual([]);
  });
});

describe('swapCandidates across builds', () => {
  const game = (core: number[], win: boolean, ap: boolean): BuildGame => ({
    win, runes: null, spells: [4, 7], skills: '', start: [], firstBack: [], boots: null,
    legendaries: core.map((id, i) => ({ id, minute: 10 + i * 8 })),
    buys: core.map((id, i): [number, number] => [id, (10 + i * 8) * 60]),
    traits: new Set(ap ? ['enemy-mostly-ap'] : []),
  });
  // Across all of a champion's games, Maw is bought far more vs AP and doesn't lose.
  const pooled = [
    ...Array.from({ length: 40 }, (_, i) => game([3036, 3031, 3156], i < 22, true)),
    ...Array.from({ length: 40 }, (_, i) => game([3036, 3031, 3142], i < 20, true)),
    ...Array.from({ length: 120 }, (_, i) => game([3036, 3031, 3142], i < 60, false)),
  ];
  const slots = [{ slot: 'core-3' as const, common: [{ itemId: 3142, share: 0.7 }] }];

  it('finds a swap on the pooled games, with how much more often it is bought', () => {
    const [candidate] = swapCandidates(pooled, items);
    expect(candidate).toMatchObject({ itemId: 3156, trigger: 'enemy-mostly-ap', buyers: 40, rateOn: 0.5, rateOff: 0 });
  });

  it('gives a build the swap only if its own players make it', () => {
    const candidates = swapCandidates(pooled, items);
    const buyers = pooled.slice(0, 60); // 40 that buy Maw vs AP, 20 that don't
    const others = pooled.slice(40, 80); // vs AP, but never buy Maw
    const [swap] = findSwaps(buyers, slots, items, candidates);
    expect(swap).toMatchObject({ itemId: 3156, replacesSlot: 'core-3', evidence: { games: 40, buyRate: [0.5, 0] } });
    expect(findSwaps(others, slots, items, candidates)).toEqual([]);
  });
});
