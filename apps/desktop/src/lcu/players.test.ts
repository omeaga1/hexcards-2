import { describe, expect, it } from 'vitest';
import type { LcuGame, LcuSummoner } from '@hexcards/data';
import { combinedSource, type PlayerSource } from './players';

const MIN = 60_000;
const summoner = (puuid: string): LcuSummoner => ({ puuid, gameName: 'Me', tagLine: 'NA1', profileIconId: 1, summonerLevel: 10 } as LcuSummoner);
const game = (id: number, at: number, puuid: string, championId = 1): LcuGame => ({
  gameId: id, gameCreation: at, gameDuration: 1800, queueId: 420, mapId: 11, gameMode: 'CLASSIC',
  participants: [{ participantId: 1, teamId: 100, championId, spell1Id: 4, spell2Id: 14, stats: {} as LcuGame['participants'][0]['stats'] }],
  participantIdentities: [{ participantId: 1, player: { puuid } }],
});

function fake(kind: 'opgg' | 'client', puuid: string, pages: LcuGame[][], fail = false): PlayerSource & { asked: number[] } {
  const asked: number[] = [];
  return {
    kind, label: kind, paged: kind === 'client', asked,
    find: async () => (fail ? Promise.reject(new Error('down')) : summoner(puuid)),
    resolve: async () => (fail ? Promise.reject(new Error('down')) : summoner(puuid)),
    ranks: async () => ({ solo: null, flex: null }),
    history: async (_p, begin) => {
      asked.push(begin);
      if (fail) throw new Error('down');
      return pages[begin / 20] ?? [];
    },
    game: async (_p, id) => [...pages.flat()].find((g) => g.gameId === id)!,
  };
}

describe('combinedSource', () => {
  const web = [game(101, 100 * MIN, 'web'), game(102, 90 * MIN, 'web')];
  const client = [[game(1, 100 * MIN + 30_000, 'cli'), game(2, 95 * MIN, 'cli'), game(3, 80 * MIN, 'cli')]];

  it('shows every OP.GG game and adds the client\'s, once each, under one PUUID', async () => {
    const both = combinedSource(fake('opgg', 'web', [web]), fake('client', 'cli', client));
    const me = await both.resolve({ puuid: 'web', gameName: 'Me', tagLine: 'NA1', profileIconId: 1, region: 'NA' });
    const first = await both.history(me, 0);
    expect(first.map((g) => g.gameId)).toEqual([101, 2, 102, 3]);
    expect(first.every((g) => g.participantIdentities[0]!.player.puuid === 'web')).toBe(true);
    expect(await both.history(me, 20)).toEqual([]);
  });

  it('keeps OP.GG\'s games when the client fails, and the client\'s when OP.GG does', async () => {
    const webOnly = combinedSource(fake('opgg', 'web', [web]), fake('client', 'cli', client, true));
    const a = await webOnly.resolve({ puuid: 'web', gameName: 'Me', tagLine: 'NA1', profileIconId: 1, region: 'NA' });
    expect((await webOnly.history(a, 0)).map((g) => g.gameId)).toEqual([101, 102]);

    const clientOnly = combinedSource(fake('opgg', 'web', [web], true), fake('client', 'cli', client));
    const b = await clientOnly.resolve({ puuid: 'cli', gameName: 'Me', tagLine: 'NA1', profileIconId: 1, region: 'NA' });
    expect((await clientOnly.history(b, 0)).map((g) => g.gameId)).toEqual([1, 2, 3]);
  });
});
