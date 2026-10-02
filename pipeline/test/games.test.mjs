import { describe, expect, it } from 'vitest';
import { bracketGroups, nextGroup, rejectReason, seedId, shuffle, tierGroup } from '../src/games.mjs';

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const match = (overrides = {}, player = () => ({})) => ({
  queueId: 420,
  mapId: 11,
  gameType: 'MATCHED_GAME',
  gameVersion: '16.19.715.1234',
  gameDuration: 1800,
  participants: [100, 200].flatMap((teamId) =>
    POSITIONS.map((teamPosition, i) => ({ teamId, teamPosition, wasAfk: false, eligibleForProgression: true, ...player(teamId, i) }))),
  ...overrides,
});

describe('rejectReason', () => {
  it('keeps a normal ranked solo game on the patch', () => {
    expect(rejectReason(match(), '16.19')).toBeNull();
  });

  it('checks the match itself is ranked solo/duo on Summoner\'s Rift', () => {
    expect(rejectReason(match({ queueId: 440 }), '16.19')).toBe('not ranked solo/duo');
    expect(rejectReason(match({ mapId: 12 }), '16.19')).toBe('not ranked solo/duo');
    expect(rejectReason(match({ gameType: 'CUSTOM_GAME' }), '16.19')).toBe('not ranked solo/duo');
  });

  it('reads the patch exactly, so 16.1 is not 16.19', () => {
    expect(rejectReason(match({ gameVersion: '16.18.700.1' }), '16.19')).toBe('other patch');
    expect(rejectReason(match({ gameVersion: '16.19.1.1' }), '16.1')).toBe('other patch');
  });

  it('drops remakes', () => {
    expect(rejectReason(match({ gameDuration: 400 }), '16.19')).toBe('remake');
  });

  it('needs one player in each position on each team', () => {
    expect(rejectReason(match({}, (team, i) => (team === 100 && i === 1 ? { teamPosition: 'TOP' } : {})), '16.19')).toBe('positions');
    expect(rejectReason(match({}, (team, i) => (i === 0 ? { teamPosition: '' } : {})), '16.19')).toBe('positions');
  });

  it('drops games with an AFK or leaver', () => {
    expect(rejectReason(match({}, (team, i) => (team === 200 && i === 2 ? { wasAfk: true } : {})), '16.19')).toBe('afk');
    expect(rejectReason(match({}, (team, i) => (team === 100 && i === 4 ? { eligibleForProgression: false } : {})), '16.19')).toBe('afk');
  });
});

describe('tier balance', () => {
  it('groups apex tiers together', () => {
    expect(tierGroup('EMERALD II')).toBe('EMERALD');
    expect(tierGroup('GRANDMASTER')).toBe('MASTER+');
    expect(bracketGroups('pro')).toEqual(['DIAMOND', 'MASTER+']);
    expect(bracketGroups('climbing')).toEqual(['EMERALD', 'PLATINUM', 'GOLD']);
  });

  it('draws from the tier with the fewest games that still has players', () => {
    const counts = { EMERALD: 50, PLATINUM: 20, GOLD: 10 };
    expect(nextGroup(['EMERALD', 'PLATINUM', 'GOLD'], counts, () => true)).toBe('GOLD');
    expect(nextGroup(['EMERALD', 'PLATINUM', 'GOLD'], counts, (g) => g !== 'GOLD')).toBe('PLATINUM');
    expect(nextGroup(['EMERALD'], counts, () => false)).toBeNull();
  });
});

describe('players', () => {
  it('hashes a player to a stable short ID', () => {
    expect(seedId('abc')).toBe(seedId('abc'));
    expect(seedId('abc')).not.toBe(seedId('abd'));
    expect(seedId('abc')).toHaveLength(16);
  });

  it('shuffles without losing anyone', () => {
    let n = 0;
    const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const list = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffle(list, random);
    expect(out).not.toEqual(list);
    expect([...out].sort((a, b) => a - b)).toEqual(list);
  });
});
