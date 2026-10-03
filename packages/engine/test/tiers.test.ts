import { describe, expect, it } from 'vitest';
import type { RoleStats } from '@hexcards/data';
import { MIN_TIER_GAMES, adjustedWinRate, buildTierList } from '../src';

const stat = (championId: number, games: number, wins: number): RoleStats => ({
  championId, role: 'jungle', games, wins, pickRate: games / 1000, banRate: 0,
});

describe('buildTierList', () => {
  it('splits ranked champions 10/20/35/25/10 and keeps every one', () => {
    // 20 champions, win rates spread from 40% to 59%.
    const stats = Array.from({ length: 20 }, (_, i) => stat(i + 1, 100, 40 + i));
    const { tiers, lowSample } = buildTierList(stats);
    expect(tiers.map((t) => t.entries.length)).toEqual([2, 4, 7, 5, 2]);
    expect(tiers.flatMap((t) => t.entries)).toHaveLength(20);
    expect(lowSample).toEqual([]);
    expect(tiers[0]!.entries.map((e) => e.championId)).toEqual([20, 19]);
    expect(tiers[4]!.entries.map((e) => e.championId)).toEqual([2, 1]);
  });

  it('does not let a small lucky sample outrank a large strong one', () => {
    const lucky = stat(1, 100, 57); // 57% over just enough games to be ranked
    const solid = stat(2, 400, 220); // 55% over 400 games
    expect(adjustedWinRate(lucky.wins, lucky.games)).toBeLessThan(adjustedWinRate(solid.wins, solid.games));
    const { tiers } = buildTierList([lucky, solid, stat(3, 300, 150), stat(4, 300, 140)]);
    const order = tiers.flatMap((t) => t.entries.map((e) => e.championId));
    expect(order.indexOf(2)).toBeLessThan(order.indexOf(1));
  });

  it(`leaves champions under ${MIN_TIER_GAMES} games unranked`, () => {
    const { tiers, lowSample } = buildTierList([stat(1, 99, 70), stat(2, 100, 50)]);
    expect(lowSample.map((e) => e.championId)).toEqual([1]);
    expect(tiers.flatMap((t) => t.entries).map((e) => e.championId)).toEqual([2]);
  });

  it('handles a role with no data', () => {
    const { tiers, lowSample } = buildTierList([]);
    expect(tiers.every((t) => t.entries.length === 0)).toBe(true);
    expect(lowSample).toEqual([]);
  });
});
