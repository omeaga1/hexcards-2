import type { LcuGame, LcuParticipant, Role } from '@hexcards/data';

// A player's form from their recent Summoner's Rift games, as the League client lists them.
// Pure functions: the same games always give the same numbers.

/** Summoner's Rift. Other maps (ARAM, Arena) are left out: Hex Cards is about the Rift. */
export const RIFT_MAP_ID = 11;
/** Games this short were remakes; nobody's record counts them. */
const REMAKE_SECONDS = 300;

export type QueueFilter = 'all' | 'solo' | 'flex' | 'normal';

export const QUEUE_FILTER_LABELS: Record<QueueFilter, string> = { all: 'All queues', solo: 'Ranked Solo/Duo', flex: 'Ranked Flex', normal: 'Normal' };

const QUEUE_IDS: Record<Exclude<QueueFilter, 'all'>, number[]> = {
  solo: [420],
  flex: [440],
  // Draft, blind, Quickplay and Swiftplay.
  normal: [400, 430, 480, 490],
};

const QUEUE_NAMES: Record<number, string> = {
  420: 'Ranked Solo/Duo', 440: 'Ranked Flex', 400: 'Normal Draft', 430: 'Normal Blind', 480: 'Swiftplay', 490: 'Quickplay', 700: 'Clash',
  0: 'Custom', 830: 'Co-op vs. AI', 840: 'Co-op vs. AI', 850: 'Co-op vs. AI', 870: 'Co-op vs. AI', 880: 'Co-op vs. AI', 890: 'Co-op vs. AI',
};

export const queueName = (queueId: number) => QUEUE_NAMES[queueId] ?? 'Summoner\'s Rift';

export const inQueue = (queueId: number, filter: QueueFilter) => filter === 'all' || QUEUE_IDS[filter].includes(queueId);

/** One player's line from one game. */
export interface PlayerGame {
  gameId: number;
  queueId: number;
  /** Epoch milliseconds. */
  createdAt: number;
  minutes: number;
  championId: number;
  role: Role | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  vision: number;
  level: number;
  /** Slots 0 to 5, then the trinket. 0 is an empty slot. */
  items: number[];
  spells: [number, number];
  keystone: number;
  subStyle: number;
}

/** TOP, JUNGLE, MIDDLE, BOTTOM: bottom splits into bot lane and support by the client's `role`. */
export function roleOf(timeline: LcuParticipant['timeline']): Role | null {
  const lane = timeline?.lane?.toUpperCase();
  const role = timeline?.role?.toUpperCase() ?? '';
  if (lane === 'TOP') return 'top';
  if (lane === 'JUNGLE') return 'jungle';
  if (lane === 'MIDDLE' || lane === 'MID') return 'middle';
  if (lane === 'BOTTOM' || lane === 'BOT') return role.includes('SUPPORT') ? 'utility' : 'bottom';
  return null;
}

const isRemake = (game: LcuGame, p: LcuParticipant) => game.gameDuration < REMAKE_SECONDS || !!p.stats.gameEndedInEarlySurrender;

/** The looked-up player's participant: by PUUID, or the only one when the list holds just them. */
export function findParticipant(game: LcuGame, puuid: string): LcuParticipant | undefined {
  const identity = game.participantIdentities.find((i) => i.player.puuid === puuid);
  if (identity) return game.participants.find((p) => p.participantId === identity.participantId);
  return game.participants.length === 1 ? game.participants[0] : undefined;
}

/** This player's line from each counted Summoner's Rift game, newest first. Remakes and other maps are dropped. */
export function playerGames(games: LcuGame[], puuid: string): PlayerGame[] {
  return games
    .filter((g) => g.mapId === RIFT_MAP_ID)
    .flatMap((g): PlayerGame[] => {
      const p = findParticipant(g, puuid);
      if (!p || isRemake(g, p)) return [];
      const s = p.stats;
      return [{
        gameId: g.gameId,
        queueId: g.queueId,
        createdAt: g.gameCreation,
        minutes: g.gameDuration / 60,
        championId: p.championId,
        role: roleOf(p.timeline),
        win: s.win,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        cs: s.totalMinionsKilled + s.neutralMinionsKilled,
        gold: s.goldEarned,
        damage: s.totalDamageDealtToChampions,
        vision: s.visionScore,
        level: s.champLevel,
        items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6],
        spells: [p.spell1Id, p.spell2Id],
        keystone: s.perk0,
        subStyle: s.perkSubStyle,
      }];
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** (Kills + assists) per death; a deathless record counts as one death so it stays finite. */
export const kdaRatio = (kills: number, deaths: number, assists: number) => (kills + assists) / Math.max(1, deaths);

export interface Totals {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Per game. */
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  csPerMin: number;
  damagePerMin: number;
  goldPerMin: number;
  visionPerMin: number;
}

export function totals(games: PlayerGame[]): Totals {
  const n = games.length;
  const sum = (f: (g: PlayerGame) => number) => games.reduce((acc, g) => acc + f(g), 0);
  const minutes = sum((g) => g.minutes) || 1;
  const wins = games.filter((g) => g.win).length;
  const [k, d, a] = [sum((g) => g.kills), sum((g) => g.deaths), sum((g) => g.assists)];
  return {
    games: n,
    wins,
    losses: n - wins,
    winRate: n ? wins / n : 0,
    kills: n ? k / n : 0,
    deaths: n ? d / n : 0,
    assists: n ? a / n : 0,
    kda: kdaRatio(k, d, a),
    csPerMin: sum((g) => g.cs) / minutes,
    damagePerMin: sum((g) => g.damage) / minutes,
    goldPerMin: sum((g) => g.gold) / minutes,
    visionPerMin: sum((g) => g.vision) / minutes,
  };
}

export interface ChampionForm extends Totals {
  championId: number;
}

/** Each champion played, most games first, then the better record. */
export function championForm(games: PlayerGame[]): ChampionForm[] {
  const byChampion = new Map<number, PlayerGame[]>();
  for (const g of games) byChampion.set(g.championId, [...(byChampion.get(g.championId) ?? []), g]);
  return [...byChampion]
    .map(([championId, list]) => ({ championId, ...totals(list) }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || b.kda - a.kda);
}

export interface RoleForm {
  role: Role;
  games: number;
  wins: number;
  share: number;
}

/** Roles played, most first. Games the client couldn't place in a role are left out of the shares. */
export function roleForm(games: PlayerGame[]): RoleForm[] {
  const placed = games.filter((g): g is PlayerGame & { role: Role } => g.role !== null);
  const byRole = new Map<Role, PlayerGame[]>();
  for (const g of placed) byRole.set(g.role, [...(byRole.get(g.role) ?? []), g]);
  return [...byRole]
    .map(([role, list]) => ({ role, games: list.length, wins: list.filter((g) => g.win).length, share: list.length / placed.length }))
    .sort((a, b) => b.games - a.games);
}

/** The run of wins or losses the newest games end on, e.g. 3 wins in a row. */
export function streak(games: PlayerGame[]): { win: boolean; length: number } | null {
  if (!games.length) return null;
  const win = games[0]!.win;
  const length = games.findIndex((g) => g.win !== win);
  return { win, length: length === -1 ? games.length : length };
}

/** Share of the team's kills a player was part of, from a full game (all ten players). */
export function killParticipation(game: LcuGame, participant: LcuParticipant): number {
  const teamKills = game.participants.filter((p) => p.teamId === participant.teamId).reduce((acc, p) => acc + p.stats.kills, 0);
  return teamKills ? (participant.stats.kills + participant.stats.assists) / teamKills : 0;
}

/** "Name#TAG" in any spacing or case. The tag is 3 to 5 letters or digits; the name 3 to 16 characters. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const [name, tag, ...rest] = input.trim().split('#');
  if (rest.length || name === undefined || tag === undefined) return null;
  const gameName = name.trim();
  const tagLine = tag.trim();
  if (gameName.length < 1 || gameName.length > 16 || !/^[\p{L}\p{N}]{2,5}$/u.test(tagLine)) return null;
  return { gameName, tagLine };
}
