import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { opggGame, opggGameNumber, opggMatches, opggRanks, opggSummoner, parseOpgg, regionFromClient } from '@hexcards/data';
import { playerGames, totals } from '../src';

// Real answers from OP.GG (Hide on bush#KR1), saved so the parser is tested against what it sends.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseOpgg', () => {
  it('maps constructor arguments to their class fields', () => {
    const text = 'class Root: data\nclass Data: name,tags,score,ok,none\n\nRoot(Data("a \\"b\\" c\\/d",[1,2],-3.5e1,true,null))';
    expect(parseOpgg(text)).toEqual({ data: { name: 'a "b" c/d', tags: [1, 2], score: -35, ok: true, none: null } });
  });

  it('handles empty lists and nested constructors', () => {
    expect(parseOpgg('class A: x,y\nclass B: z\n\nA([],B(7))')).toEqual({ x: [], y: { z: 7 } });
  });

  it('rejects malformed text', () => {
    expect(() => parseOpgg('class A: x\n\nA(1')).toThrow();
  });
});

describe('OP.GG profile', () => {
  const parsed = parseOpgg(fixture('opgg-profile.txt'));

  it('reads the player', () => {
    const s = opggSummoner(parsed);
    expect(s).toMatchObject({ gameName: 'Hide on bush', tagLine: 'KR1' });
    expect(s.puuid.length).toBeGreaterThan(20);
    expect(s.summonerLevel).toBeGreaterThan(0);
    expect(Number.isInteger(s.profileIconId)).toBe(true);
  });

  it('reads ranked queues, unranked as null', () => {
    const { solo, flex } = opggRanks(parsed);
    expect(solo?.queueType).toBe('RANKED_SOLO_5x5');
    expect(solo!.wins + solo!.losses).toBeGreaterThan(0);
    expect(['MASTER', 'GRANDMASTER', 'CHALLENGER']).toContain(solo!.tier);
    expect(flex).toBeNull();
  });
});

describe('OP.GG matches', () => {
  const { games, keys } = opggMatches(parseOpgg(fixture('opgg-matches.txt')));
  const me = opggSummoner(parseOpgg(fixture('opgg-profile.txt')));

  it('returns each game in client shape with a key to open it', () => {
    expect(games.length).toBeGreaterThan(5);
    for (const g of games) {
      expect(keys.get(g.gameId)?.id).toBeTruthy();
      expect(g.participants).toHaveLength(1);
      expect(Number.isFinite(g.gameCreation)).toBe(true);
    }
  });

  it('feeds the same stats as the client does', () => {
    const lines = playerGames(games, me.puuid);
    expect(lines.length).toBeGreaterThan(0);
    const t = totals(lines);
    expect(t.games).toBe(lines.length);
    expect(t.csPerMin).toBeGreaterThan(0);
    // OP.GG doesn't give vision score.
    expect(t.visionPerMin).toBeNull();
    expect(lines.every((g) => g.items.length === 7)).toBe(true);
  });
});

describe('OP.GG game', () => {
  const game = opggGame(parseOpgg(fixture('opgg-game.txt')));

  it('has both teams of five with names and a winner', () => {
    expect(game.participants).toHaveLength(10);
    expect(game.participants.filter((p) => p.teamId === 100)).toHaveLength(5);
    expect(game.participantIdentities.every((i) => i.player.gameName)).toBe(true);
    expect(game.participants.filter((p) => p.stats.win)).toHaveLength(5);
  });
});

describe('regions', () => {
  it('maps client platforms to OP.GG regions', () => {
    expect(regionFromClient('NA1')).toBe('NA');
    expect(regionFromClient('la2')).toBe('LAS');
    expect(regionFromClient('EUN1')).toBe('EUNE');
    expect(regionFromClient('XX')).toBeNull();
  });

  it('numbers game ids stably', () => {
    expect(opggGameNumber('abc')).toBe(opggGameNumber('abc'));
    expect(opggGameNumber('abc')).not.toBe(opggGameNumber('abd'));
  });
});
