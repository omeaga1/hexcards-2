import { describe, expect, it } from 'vitest';
import { RoleTable, type GameRecord, type PickTable, type RoleData } from '@hexcards/data';
import { countPicks, guessRoles, laneOpponent, suggestPicks } from '../src';

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const game = (blue: number[], red: number[], blueWins: boolean): GameRecord => ({
  id: 'x', region: 'na1', version: '16.19.1', duration: 1800, bans: [],
  players: [
    ...blue.map((champ, i) => ({ champ, team: 100 as const, pos: POSITIONS[i]!, win: (blueWins ? 1 : 0) as 0 | 1, runes: null, spells: [4, 12] as [number, number], skills: '', buys: [] })),
    ...red.map((champ, i) => ({ champ, team: 200 as const, pos: POSITIONS[i]!, win: (blueWins ? 0 : 1) as 0 | 1, runes: null, spells: [4, 12] as [number, number], skills: '', buys: [] })),
  ],
});

describe('countPicks', () => {
  it('counts each champion in its role, against its lane opponent and with the team traits', () => {
    // Champion 10 is an AP threat; three of them make the enemy "mostly AP" for the other side.
    const traits = { 10: ['ap' as const], 11: ['ap' as const], 12: ['ap' as const] };
    const games = [
      ...Array.from({ length: 4 }, () => game([1, 2, 3, 4, 5], [6, 10, 11, 12, 9], true)),
      game([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], false),
    ];
    const table = countPicks(games, traits);
    expect(table[1]!.top).toMatchObject({ games: 5, wins: 4, vs: { 6: [5, 4] } });
    expect(table[1]!.top!.traits['enemy-mostly-ap']).toEqual([4, 4]);
    // Lane pairs seen fewer than 3 times are left out.
    expect(table[2]!.jungle!.vs).toEqual({ 10: [4, 4] });
  });
});

describe('guessRoles', () => {
  it('puts each enemy in a different role, the likeliest overall', () => {
    const shares: Record<number, Partial<Record<string, number>>> = {
      1: { top: 0.6, middle: 0.4 }, // mostly top, sometimes mid
      2: { top: 0.9 }, // only top
      3: { middle: 0.8, jungle: 0.2 },
    };
    const roles = guessRoles([1, 2, 3], (id, role) => shares[id]?.[role] ?? 0);
    expect(roles.get(2)).toBe('top');
    expect(roles.get(1)).toBe('middle');
    expect(roles.get(3)).toBe('jungle');
  });
});

describe('suggestPicks', () => {
  // Role data: champions 1-4 play top; 20 is the enemy top laner.
  const roleData: RoleData = {
    patch: '16.19',
    games: 1000,
    champions: Object.fromEntries([1, 2, 3, 4, 20].map((id) => [id, { bans: 0, roles: { TOP: [200, 100], JUNGLE: [0, 0], MIDDLE: [0, 0], BOTTOM: [0, 0], UTILITY: [0, 0] } }])),
  };
  const roles = new RoleTable(roleData);
  const row = (games: number, wins: number, vs: Record<number, [number, number]> = {}) => ({ games, wins, traits: {}, vs });
  const picks: PickTable = {
    1: { top: row(400, 210, { 20: [100, 40] }) }, // 52.5%, but loses to 20
    2: { top: row(400, 200, { 20: [100, 62] }) }, // 50%, beats 20
    3: { top: row(400, 204) },
    4: { top: row(30, 25) }, // great record, too few games
    20: { top: row(400, 200) },
  };
  const input = { role: 'top' as const, picks, roles, traitTable: {}, allies: [], enemies: [20], unavailable: new Set<number>() };

  it('guesses the lane opponent and favors champions that beat it', () => {
    expect(laneOpponent('top', [20], roles)).toBe(20);
    const { opponent, suggestions } = suggestPicks(input);
    expect(opponent).toBe(20);
    expect(suggestions[0]!.championId).toBe(2);
    expect(suggestions[0]!.reason).toMatchObject({ kind: 'lane', opponent: 20, games: 100 });
    expect(suggestions.map((s) => s.championId)).not.toContain(4); // under MIN_PICK_GAMES
  });

  it('leaves out picked, banned and unowned champions', () => {
    const ids = (extra: object) => suggestPicks({ ...input, ...extra }).suggestions.map((s) => s.championId);
    expect(ids({ unavailable: new Set([2]) })).not.toContain(2);
    expect(ids({ owned: new Set([1, 3]) })).toEqual([3, 1]);
  });

  it('falls back to the role win rate when there is no lane opponent yet', () => {
    const { opponent, suggestions } = suggestPicks({ ...input, enemies: [] });
    expect(opponent).toBeUndefined();
    expect(suggestions[0]).toMatchObject({ championId: 1, reason: { kind: 'strong' } });
  });
});
