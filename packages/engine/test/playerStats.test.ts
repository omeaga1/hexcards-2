import { describe, expect, it } from 'vitest';
import type { LcuGame, LcuParticipant } from '@hexcards/data';
import { championForm, filterChoices, filterGames, kdaRatio, killParticipation, parseRiotId, playerGames, roleForm, roleOf, streak, totals } from '../src';

const ME = 'me-puuid';

function participant(id: number, over: Partial<LcuParticipant['stats']> & { championId?: number; teamId?: number; lane?: string; role?: string } = {}): LcuParticipant {
  const { championId = 1, teamId = 100, lane = 'TOP', role = 'SOLO', ...stats } = over;
  return {
    participantId: id, teamId, championId, spell1Id: 4, spell2Id: 12, timeline: { lane, role },
    stats: {
      win: true, kills: 5, deaths: 2, assists: 7, totalMinionsKilled: 180, neutralMinionsKilled: 20, goldEarned: 12000,
      totalDamageDealtToChampions: 20000, visionScore: 25, champLevel: 16,
      item0: 3078, item1: 3047, item2: 6333, item3: 0, item4: 0, item5: 0, item6: 3340, perk0: 8010, perkPrimaryStyle: 8000, perkSubStyle: 8400,
      ...stats,
    },
  };
}

function game(id: number, p: LcuParticipant, over: Partial<LcuGame> = {}): LcuGame {
  return {
    gameId: id, gameCreation: id * 1000, gameDuration: 1800, queueId: 420, mapId: 11, gameMode: 'CLASSIC',
    participants: [p], participantIdentities: [{ participantId: p.participantId, player: { puuid: ME, gameName: 'Me', tagLine: 'NA1' } }],
    ...over,
  };
}

describe('playerGames', () => {
  it('keeps Summoner\'s Rift games, newest first, and drops remakes and other maps', () => {
    const games = [
      game(1, participant(1)),
      game(3, participant(1)),
      game(2, participant(1), { mapId: 12, queueId: 450 }), // ARAM
      game(4, participant(1), { gameDuration: 200 }), // remake
      game(5, participant(1, { gameEndedInEarlySurrender: true })),
    ];
    expect(playerGames(games, ME).map((g) => g.gameId)).toEqual([3, 1]);
  });

  it('finds the player among ten by PUUID', () => {
    const ten = Array.from({ length: 10 }, (_, i) => participant(i + 1, { championId: 100 + i }));
    const g: LcuGame = {
      ...game(1, ten[0]!),
      participants: ten,
      participantIdentities: ten.map((p) => ({ participantId: p.participantId, player: { puuid: p.participantId === 7 ? ME : `other-${p.participantId}` } })),
    };
    expect(playerGames([g], ME)[0]!.championId).toBe(106);
  });

  it('adds lane minions and jungle monsters into CS', () => {
    expect(playerGames([game(1, participant(1))], ME)[0]!.cs).toBe(200);
  });
});

describe('totals', () => {
  it('averages per game and rates per minute over all minutes played', () => {
    const lines = playerGames([
      game(1, participant(1, { win: true, kills: 10, deaths: 0, assists: 5 }), { gameDuration: 1200 }),
      game(2, participant(1, { win: false, kills: 2, deaths: 6, assists: 3 }), { gameDuration: 2400 }),
    ], ME);
    const t = totals(lines);
    expect([t.games, t.wins, t.losses, t.winRate]).toEqual([2, 1, 1, 0.5]);
    expect([t.kills, t.deaths, t.assists]).toEqual([6, 3, 4]);
    expect(t.kda).toBeCloseTo(20 / 6);
    expect(t.csPerMin).toBeCloseTo(400 / 60);
  });

  it('is all zeros with no games', () => {
    expect(totals([])).toMatchObject({ games: 0, winRate: 0, kills: 0, csPerMin: 0 });
  });

  it('counts a deathless KDA as if one death', () => {
    expect(kdaRatio(4, 0, 6)).toBe(10);
  });
});

describe('championForm and roleForm', () => {
  const lines = playerGames([
    game(1, participant(1, { championId: 10, win: false })),
    game(2, participant(1, { championId: 20 })),
    game(3, participant(1, { championId: 20, lane: 'BOTTOM', role: 'SUPPORT' })),
    game(4, participant(1, { championId: 30, lane: 'BOTTOM', role: 'CARRY' })),
    game(5, participant(1, { championId: 10, lane: 'NONE', role: 'NONE' })),
  ], ME);

  it('lists champions by games, then record', () => {
    expect(championForm(lines).map((c) => [c.championId, c.games, c.wins])).toEqual([[20, 2, 2], [10, 2, 1], [30, 1, 1]]);
  });

  it('splits bot lane from support and leaves unplaced games out of the shares', () => {
    expect(roleForm(lines).map((r) => [r.role, r.games, r.share])).toEqual([['top', 2, 0.5], ['bottom', 1, 0.25], ['utility', 1, 0.25]]);
    expect(roleOf({ lane: 'MID', role: 'SOLO' })).toBe('middle');
    expect(roleOf(undefined)).toBeNull();
  });
});

describe('streak', () => {
  it('counts the run the newest games end on', () => {
    const lines = playerGames([1, 2, 3, 4].map((id) => game(id, participant(1, { win: id !== 1 }))), ME);
    expect(streak(lines)).toEqual({ win: true, length: 3 });
    expect(streak([])).toBeNull();
  });
});

describe('killParticipation', () => {
  it('is kills plus assists over the team\'s kills', () => {
    const mine = participant(1, { kills: 4, assists: 6 });
    const ally = participant(2, { kills: 6, assists: 0 });
    const enemy = participant(6, { kills: 30, teamId: 200 });
    expect(killParticipation({ ...game(1, mine), participants: [mine, ally, enemy] }, mine)).toBe(1);
  });
});

describe('filterGames', () => {
  const lines = playerGames([
    game(1, participant(1, { championId: 10, win: false })),
    game(2, participant(1, { championId: 20 }), { queueId: 400 }),
    game(3, participant(1, { championId: 20, lane: 'BOTTOM', role: 'CARRY' }), { queueId: 400 }),
    game(4, participant(1, { championId: 10 }), { queueId: 440 }),
  ], ME);

  it('narrows by mode, champion, role and result together', () => {
    expect(filterGames(lines, {}).length).toBe(4);
    expect(filterGames(lines, { mode: 'Normal Draft' }).map((g) => g.gameId)).toEqual([3, 2]);
    expect(filterGames(lines, { championId: 10, result: 'losses' }).map((g) => g.gameId)).toEqual([1]);
    expect(filterGames(lines, { mode: 'Normal Draft', role: 'top' }).map((g) => g.gameId)).toEqual([2]);
    expect(filterGames(lines, { mode: 'all', championId: 'all', role: 'all', result: 'wins' }).length).toBe(3);
  });

  it('lists the choices present, most games first', () => {
    expect(filterChoices(lines, (g) => g.championId)).toEqual([[10, 2], [20, 2]]);
    expect(filterChoices(lines, (g) => g.role)).toEqual([['top', 3], ['bottom', 1]]);
  });
});

describe('jungle without Smite', () => {
  it('leaves the role unplaced: the client guessed the lane wrong', () => {
    const p = participant(1, { lane: 'JUNGLE', role: 'NONE' });
    expect(playerGames([game(1, p)], ME)[0]!.role).toBeNull();
    expect(playerGames([game(1, { ...p, spell2Id: 11 })], ME)[0]!.role).toBe('jungle');
  });
});

describe('parseRiotId', () => {
  it('reads Name#TAG with loose spacing', () => {
    expect(parseRiotId('  Hide on bush #KR1 ')).toEqual({ gameName: 'Hide on bush', tagLine: 'KR1' });
    expect(parseRiotId('Café#ÉUW')).toEqual({ gameName: 'Café', tagLine: 'ÉUW' });
  });

  it('rejects input without a usable tag', () => {
    expect(parseRiotId('Faker')).toBeNull();
    expect(parseRiotId('Faker#')).toBeNull();
    expect(parseRiotId('a#b#c')).toBeNull();
    expect(parseRiotId('Faker#TOOLONG')).toBeNull();
  });
});
