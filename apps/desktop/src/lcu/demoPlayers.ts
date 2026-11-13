import type { LcuGame, LcuParticipant, LcuRankedQueue, LcuSummoner } from '@hexcards/data';
import type { LcuClient } from '@hexcards/engine';

/**
 * Development only: a pretend League client with made-up players, so the Players page can be worked
 * on without League running. Open the dev server with ?demo=players. Any Riot ID resolves to a
 * generated player, except one containing "nobody". Release builds leave this out.
 */
export const demoPlayersEnabled = () => new URLSearchParams(window.location.search).get('demo') === 'players';

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!;

type Lane = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'SUPPORT';
const POOLS: Record<Lane, { champions: number[]; items: number[]; boots: number[]; runes: [number, number, number][]; spells: [number, number] }> = {
  TOP: { champions: [266, 24, 122, 86, 516], items: [3078, 3053, 6333, 3071, 6610, 3748], boots: [3047, 3111], runes: [[8010, 8000, 8400], [8437, 8400, 8000]], spells: [4, 12] },
  JUNGLE: { champions: [64, 60, 121, 234, 254], items: [6692, 3142, 6333, 3071, 3026, 6694], boots: [3047, 3111], runes: [[8010, 8000, 8100], [8112, 8100, 8000]], spells: [4, 11] },
  MIDDLE: { champions: [103, 134, 7, 61, 517], items: [6655, 3089, 3157, 4645, 3135, 3165], boots: [3020], runes: [[8112, 8100, 8300], [8229, 8200, 8300]], spells: [4, 14] },
  BOTTOM: { champions: [51, 145, 222, 202, 498], items: [3031, 3094, 3036, 3087, 6672, 3072], boots: [3006], runes: [[8005, 8000, 8300], [8021, 8000, 8200]], spells: [4, 7] },
  SUPPORT: { champions: [412, 117, 89, 350, 43], items: [3190, 3109, 3222, 6617, 3504, 2065], boots: [3047, 3158], runes: [[8439, 8400, 8300], [8214, 8200, 8400]], spells: [4, 14] },
};
const LANES = Object.keys(POOLS) as Lane[];
const NAMES = ['Baron Breath', 'Wardless', 'Gank Plank', 'Mid Or Feed', 'Dragon Soul', 'Herald Hug', 'Tower Diver', 'Minion Maw', 'Blue Side', 'Red Buff', 'Flash Fwd', 'Pinkward', 'Last Hit', 'Nexus Ping', 'Scuttle', 'Jungle Diff'];

const players = new Map<string, LcuSummoner>();
const games = new Map<number, LcuGame>();
const historyOf = new Map<string, number[]>();

function player(gameName: string, tagLine: string, level?: number): LcuSummoner {
  const puuid = `demo-${hash(`${gameName.toLowerCase()}#${tagLine.toLowerCase()}`).toString(36)}`;
  const known = players.get(puuid);
  if (known) return known;
  const r = rng(hash(puuid));
  const s: LcuSummoner = { puuid, gameName, tagLine, summonerLevel: level ?? 30 + Math.floor(r() * 600), profileIconId: 4000 + Math.floor(r() * 900), privacy: 'PUBLIC' };
  players.set(puuid, s);
  return s;
}

const ME = player('Rift Walker', 'NA1', 287);

function makeParticipant(r: () => number, id: number, teamId: number, lane: Lane, win: boolean, minutes: number, skill: number, championId?: number): LcuParticipant {
  const pool = POOLS[lane];
  const finished = Math.min(6, Math.max(2, Math.floor(minutes / 6.5)));
  const items = [...pool.items].sort(() => r() - 0.5).slice(0, finished - 1);
  const slots = [pick(r, pool.boots), ...items, 0, 0, 0, 0, 0].slice(0, 6);
  const [keystone, primary, sub] = pick(r, pool.runes);
  const carry = lane !== 'SUPPORT';
  const kills = Math.round((carry ? 4 + r() * 8 : r() * 3) * (win ? 1.3 : 0.75) * skill);
  const deaths = Math.round((2 + r() * 6) * (win ? 0.75 : 1.2) / skill);
  const assists = Math.round((carry ? 3 + r() * 8 : 8 + r() * 12) * (win ? 1.25 : 0.8));
  const cs = lane === 'SUPPORT' ? 20 + r() * 25 : lane === 'JUNGLE' ? minutes * (5 + r() * 1.5) : minutes * (6 + r() * 2.5) * skill;
  return {
    participantId: id,
    teamId,
    championId: championId ?? pick(r, pool.champions),
    spell1Id: pool.spells[0],
    spell2Id: pool.spells[1],
    timeline: lane === 'SUPPORT' ? { lane: 'BOTTOM', role: 'SUPPORT' } : lane === 'BOTTOM' ? { lane: 'BOTTOM', role: 'CARRY' } : { lane, role: 'SOLO' },
    stats: {
      win, kills, deaths, assists,
      totalMinionsKilled: Math.round(lane === 'JUNGLE' ? cs * 0.2 : cs),
      neutralMinionsKilled: Math.round(lane === 'JUNGLE' ? cs * 0.8 : 0),
      goldEarned: Math.round(minutes * (carry ? 380 : 260) * (win ? 1.08 : 0.94)),
      totalDamageDealtToChampions: Math.round(minutes * (carry ? 650 + r() * 500 : 250 + r() * 250) * skill),
      visionScore: Math.round(minutes * (lane === 'SUPPORT' ? 2.2 : lane === 'JUNGLE' ? 1.2 : 0.7) * (0.8 + r() * 0.4)),
      champLevel: Math.min(18, Math.round(minutes / 1.9 + (lane === 'SUPPORT' ? -1 : 1))),
      item0: slots[0]!, item1: slots[1]!, item2: slots[2]!, item3: slots[3]!, item4: slots[4]!, item5: slots[5]!,
      item6: lane === 'SUPPORT' ? 3364 : 3340,
      perk0: keystone, perkPrimaryStyle: primary, perkSubStyle: sub,
    },
  };
}

/** Sixty games for a player, newest first, each with all ten players. */
function history(p: LcuSummoner): number[] {
  const known = historyOf.get(p.puuid);
  if (known) return known;
  const r = rng(hash(p.puuid) ^ 0x9e3779b9);
  // Each player has a main role, a second one, and a skill that tilts their record.
  const main = pick(r, LANES);
  const second = pick(r, LANES.filter((l) => l !== main));
  const skill = 0.85 + r() * 0.4;
  const favourites = POOLS[main].champions.slice(0, 3);
  const ids: number[] = [];
  let at = Date.UTC(2026, 10, 13, 3, 30);
  for (let i = 0; i < 60; i++) {
    at -= (40 + r() * 60) * 60_000 + (r() < 0.2 ? 20 * 3_600_000 : 0);
    const minutes = 20 + r() * 18;
    const win = r() < 0.38 + skill * 0.12;
    const lane = r() < 0.72 ? main : second;
    const queueId = r() < 0.6 ? 420 : r() < 0.5 ? 440 : r() < 0.5 ? 400 : 490;
    const myTeam = r() < 0.5 ? 100 : 200;
    const championId = lane === main && r() < 0.75 ? pick(r, favourites) : undefined;
    const gameId = 5_100_000_000 + (hash(p.puuid) % 1_000_000) * 100 + i;
    const used = new Set<number>();
    const participants: LcuParticipant[] = [];
    const identities: LcuGame['participantIdentities'] = [];
    let n = 1;
    for (const teamId of [100, 200]) {
      for (const l of LANES) {
        const mine = teamId === myTeam && l === lane;
        let part = makeParticipant(r, n, teamId, l, teamId === myTeam ? win : !win, minutes, mine ? skill : 0.9 + r() * 0.2, mine ? championId : undefined);
        // One of each champion per game.
        if (used.has(part.championId)) part = { ...part, championId: POOLS[l].champions.find((c) => !used.has(c)) ?? part.championId };
        used.add(part.championId);
        participants.push(part);
        const who = mine ? p : player(pick(r, NAMES), pick(r, ['NA1', 'NA2', 'RIFT']));
        identities.push({ participantId: n, player: { puuid: who.puuid, gameName: who.gameName, tagLine: who.tagLine, profileIcon: who.profileIconId } });
        n++;
      }
    }
    games.set(gameId, {
      gameId, gameCreation: at, gameDuration: Math.round(minutes * 60), queueId, mapId: 11, gameMode: 'CLASSIC',
      participants, participantIdentities: identities,
      teams: [{ teamId: 100, win: (myTeam === 100) === win ? 'Win' : 'Fail' }, { teamId: 200, win: (myTeam === 200) === win ? 'Win' : 'Fail' }],
    });
    ids.push(gameId);
  }
  historyOf.set(p.puuid, ids);
  return ids;
}

function ranks(p: LcuSummoner): { queueMap: Record<string, LcuRankedQueue> } {
  const r = rng(hash(p.puuid) ^ 0x51ed);
  const tiers = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
  const queue = (type: string, ranked: boolean): LcuRankedQueue => {
    if (!ranked) return { queueType: type, tier: '', division: 'NA', leaguePoints: 0, wins: 0, losses: 0 };
    const wins = 20 + Math.floor(r() * 120);
    return { queueType: type, tier: pick(r, tiers), division: pick(r, ['I', 'II', 'III', 'IV']), leaguePoints: Math.floor(r() * 100), wins, losses: Math.round(wins * (0.8 + r() * 0.35)) };
  };
  return { queueMap: { RANKED_SOLO_5x5: queue('RANKED_SOLO_5x5', true), RANKED_FLEX_SR: queue('RANKED_FLEX_SR', r() < 0.6) } };
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 350));
const reply = <T,>(status: number, body: unknown) => ({ status, body: body as T });

export const demoPlayersClient: LcuClient = {
  async request<T>(_method: string, path: string) {
    await wait();
    const url = new URL(path, 'https://127.0.0.1');
    const parts = url.pathname.split('/');
    if (url.pathname === '/lol-summoner/v1/current-summoner') return reply<T>(200, ME);
    if (url.pathname === '/riotclient/region-locale') return reply<T>(200, { region: 'NA', webRegion: 'na', locale: 'en_US' });
    if (url.pathname === '/lol-summoner/v1/summoners') {
      const [gameName = '', tagLine = ''] = (url.searchParams.get('name') ?? '').split('#');
      if (gameName.toLowerCase().includes('nobody')) return reply<T>(404, { message: 'not found' });
      return reply<T>(200, player(gameName, tagLine));
    }
    if (url.pathname.startsWith('/lol-summoner/v2/summoners/puuid/')) {
      const p = players.get(parts[5]!);
      return p ? reply<T>(200, p) : reply<T>(404, {});
    }
    if (url.pathname.startsWith('/lol-ranked/v1/ranked-stats/')) {
      const p = players.get(parts[4]!);
      return p ? reply<T>(200, ranks(p)) : reply<T>(404, {});
    }
    if (url.pathname.startsWith('/lol-match-history/v1/products/lol/')) {
      const p = players.get(parts[5]!);
      if (!p) return reply<T>(404, {});
      const begin = Number(url.searchParams.get('begIndex') ?? 0);
      const end = Number(url.searchParams.get('endIndex') ?? begin + 20);
      // Like the client: each game in the list holds only the looked-up player.
      const list = history(p).slice(begin, end).map((id) => {
        const g = games.get(id)!;
        const identity = g.participantIdentities.find((i) => i.player.puuid === p.puuid)!;
        return { ...g, participants: g.participants.filter((x) => x.participantId === identity.participantId), participantIdentities: [identity] };
      });
      return reply<T>(200, { games: { games: list, gameCount: list.length } });
    }
    if (url.pathname.startsWith('/lol-match-history/v1/games/')) {
      const g = games.get(Number(parts[4]));
      return g ? reply<T>(200, g) : reply<T>(404, {});
    }
    return reply<T>(404, {});
  },
} as LcuClient;
