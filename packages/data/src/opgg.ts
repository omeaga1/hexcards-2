import type { LcuGame, LcuParticipant, LcuRankedQueue, LcuSummoner } from './lcu';

// Player stats from OP.GG's public data service, for when the League client isn't running.
// Answers come in a compact class notation, e.g.
//
//   class Summoner: puuid,game_name,tagline
//   class TierInfo: tier,division,lp
//
//   Profile(Data(Summoner("abc","Faker","KR1"),...))
//
// parseOpgg turns that into plain objects ({ puuid: "abc", game_name: "Faker", ... }), and the
// converters below reshape them into the same League client shapes the rest of the app reads.

export class OpggParseError extends Error {}

/** OP.GG's class notation → plain objects keyed by each class's field names. */
export function parseOpgg(text: string): unknown {
  const lines = text.split('\n');
  const classes = new Map<string, string[]>();
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /^class (\w+):\s*(.*)$/.exec(line);
    if (m) classes.set(m[1]!, m[2] ? m[2].split(',').map((f) => f.trim()) : []);
    else if (line.trim()) break;
  }
  const src = lines.slice(i).join('\n');
  let p = 0;

  const fail = (what: string): never => {
    throw new OpggParseError(`OP.GG answer: ${what} at ${p}`);
  };
  const skip = () => {
    while (p < src.length && /\s/.test(src[p]!)) p++;
  };
  const expect = (c: string) => {
    skip();
    if (src[p] !== c) fail(`expected "${c}"`);
    p++;
  };

  const value = (): unknown => {
    skip();
    const c = src[p];
    if (c === '"') {
      const start = p++;
      while (p < src.length && src[p] !== '"') p += src[p] === '\\' ? 2 : 1;
      if (p >= src.length) fail('unterminated string');
      p++;
      return JSON.parse(src.slice(start, p));
    }
    if (c === '[') {
      p++;
      const list: unknown[] = [];
      skip();
      if (src[p] === ']') {
        p++;
        return list;
      }
      for (;;) {
        list.push(value());
        skip();
        if (src[p] === ',') p++;
        else if (src[p] === ']') {
          p++;
          return list;
        } else fail('expected "," or "]"');
      }
    }
    const num = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    num.lastIndex = p;
    const n = num.exec(src);
    if (n) {
      p = num.lastIndex;
      return Number(n[0]);
    }
    const ident = /[A-Za-z_]\w*/y;
    ident.lastIndex = p;
    const id = ident.exec(src);
    if (!id) return fail('unexpected character');
    p = ident.lastIndex;
    const name = id[0];
    if (name === 'null') return null;
    if (name === 'true') return true;
    if (name === 'false') return false;
    expect('(');
    const args: unknown[] = [];
    skip();
    if (src[p] === ')') p++;
    else {
      for (;;) {
        args.push(value());
        skip();
        if (src[p] === ',') p++;
        else if (src[p] === ')') {
          p++;
          break;
        } else fail('expected "," or ")"');
      }
    }
    const fields = classes.get(name) ?? args.map((_, k) => String(k));
    return Object.fromEntries(fields.map((f, k) => [f, args[k] ?? null]));
  };

  const result = value();
  return result;
}

// What Hex Cards asks for. OP.GG returns only the fields named here.

export const OPGG_PROFILE_FIELDS = [
  'data.summoner.{puuid,game_name,tagline,profile_image_url,level}',
  'data.summoner.league_stats[].{game_type,win,lose}',
  'data.summoner.league_stats[].tier_info.{tier,division,lp}',
];

export const OPGG_MATCH_FIELDS = [
  'data.game_history[].{id,created_at,game_map,game_type,game_length_second}',
  'data.game_history[].participants[].{champion_id,team_key,position,items[],spells[]}',
  'data.game_history[].participants[].rune.{primary_page_id,primary_rune_id,secondary_page_id}',
  'data.game_history[].participants[].summoner.{puuid,game_name,tagline,profile_image_url}',
  'data.game_history[].participants[].stats.{champion_level,kill,death,assist,minion_kill,neutral_minion_kill,gold_earned,total_damage_dealt_to_champions,result}',
  'data.game_history[].teams[].{key}',
  'data.game_history[].teams[].game_stat.{is_win,champion_kill,gold_earned}',
];

export const OPGG_GAME_FIELDS = [
  'data.game_detail.{id,created_at,game_map,game_type,game_length_second}',
  'data.game_detail.teams[].{key}',
  'data.game_detail.teams[].game_stat.{is_win,champion_kill,gold_earned}',
  'data.game_detail.teams[].participants[].{champion_id,team_key,position,items[],spells[]}',
  'data.game_detail.teams[].participants[].rune.{primary_page_id,primary_rune_id,secondary_page_id}',
  'data.game_detail.teams[].participants[].summoner.{puuid,game_name,tagline}',
  'data.game_detail.teams[].participants[].stats.{champion_level,kill,death,assist,minion_kill,neutral_minion_kill,gold_earned,total_damage_dealt_to_champions,result}',
];

/** OP.GG regions, as its lookups take them. */
export const OPGG_REGIONS = ['NA', 'EUW', 'EUNE', 'KR', 'BR', 'LAN', 'LAS', 'OCE', 'JP', 'TR', 'RU', 'ME', 'SG', 'TW', 'VN'] as const;
export type Region = (typeof OPGG_REGIONS)[number];

export const REGION_LABELS: Record<Region, string> = {
  NA: 'North America', EUW: 'Europe West', EUNE: 'Europe Nordic & East', KR: 'Korea', BR: 'Brazil', LAN: 'Latin America North',
  LAS: 'Latin America South', OCE: 'Oceania', JP: 'Japan', TR: 'Türkiye', RU: 'Russia', ME: 'Middle East', SG: 'Southeast Asia',
  TW: 'Taiwan', VN: 'Vietnam',
};

/** The League client's region or platform ("NA", "EUW1", "LA1", "OC1"...) → the region OP.GG takes. */
export function regionFromClient(region: string | undefined): Region | null {
  const r = (region ?? '').toUpperCase();
  const map: Record<string, Region> = {
    NA: 'NA', NA1: 'NA', EUW: 'EUW', EUW1: 'EUW', EUNE: 'EUNE', EUN1: 'EUNE', KR: 'KR', BR: 'BR', BR1: 'BR', LA1: 'LAN', LAN: 'LAN',
    LA2: 'LAS', LAS: 'LAS', OC1: 'OCE', OCE: 'OCE', JP: 'JP', JP1: 'JP', TR: 'TR', TR1: 'TR', RU: 'RU', ME: 'ME', ME1: 'ME',
    SG: 'SG', SG2: 'SG', PH2: 'SG', TH2: 'SG', TW: 'TW', TW2: 'TW', VN: 'VN', VN2: 'VN',
  };
  return map[r] ?? null;
}

// Shapes of the parsed answers (only the fields asked for above).

interface OpggSummoner {
  puuid: string;
  game_name: string;
  tagline: string;
  profile_image_url?: string | null;
  level?: number | null;
  league_stats?: { game_type: string; win: number | null; lose: number | null; tier_info: { tier: string | null; division: number | null; lp: number | null } | null }[] | null;
}

interface OpggParticipant {
  summoner: { puuid: string; game_name: string; tagline: string; profile_image_url?: string | null } | null;
  champion_id: number;
  team_key: string;
  position: string | null;
  items: number[] | null;
  spells: number[] | null;
  rune?: { primary_page_id: number | null; primary_rune_id: number | null; secondary_page_id: number | null } | null;
  stats: {
    champion_level: number; kill: number; death: number; assist: number; minion_kill: number; neutral_minion_kill: number;
    gold_earned: number; total_damage_dealt_to_champions: number; result: string;
  };
}

interface OpggGame {
  id: string;
  created_at: string;
  game_map: string;
  game_type: string;
  game_length_second: number;
  participants?: OpggParticipant[];
  teams: { key: string; game_stat: { is_win: boolean } | null; participants?: OpggParticipant[] }[];
}

/** Where to find one game again: OP.GG looks games up by its own id and the time they started. */
export interface OpggGameKey {
  id: string;
  createdAt: string;
}

const QUEUES: Record<string, number> = {
  SOLORANKED: 420, FLEXRANKED: 440, NORMAL: 400, BLIND: 430, QUICKPLAY: 490, SWIFTPLAY: 480, CLASH: 700, ARAM: 450, ARENA: 1700, URF: 900, BOT: 830, CUSTOM: 0,
};
const MAPS: Record<string, number> = { SUMMONERS_RIFT: 11, HOWLING_ABYSS: 12, ARENA: 30 };
const TRINKETS = new Set([3340, 3363, 3364, 3330, 3513]);
const DIVISIONS = ['', 'I', 'II', 'III', 'IV'];

const iconId = (url: string | null | undefined) => Number(/profileIcon(\d+)/i.exec(url ?? '')?.[1] ?? 29);

/** A stable number for OP.GG's string game id, so games key the same way as the client's. */
export function opggGameNumber(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function data(parsed: unknown): Record<string, unknown> {
  const d = (parsed as { data?: Record<string, unknown> } | null)?.data;
  if (!d) throw new OpggParseError('OP.GG answer has no data');
  return d;
}

export function opggSummoner(parsed: unknown): LcuSummoner {
  const s = data(parsed).summoner as OpggSummoner | undefined;
  if (!s?.puuid) throw new OpggParseError('OP.GG answer has no player');
  return { puuid: s.puuid, gameName: s.game_name, tagLine: s.tagline, summonerLevel: s.level ?? 0, profileIconId: iconId(s.profile_image_url) };
}

export function opggRanks(parsed: unknown): { solo: LcuRankedQueue | null; flex: LcuRankedQueue | null } {
  const s = data(parsed).summoner as OpggSummoner | undefined;
  const queue = (type: string, queueType: string): LcuRankedQueue | null => {
    const q = s?.league_stats?.find((l) => l.game_type === type);
    const tier = q?.tier_info?.tier;
    if (!q || !tier) return null;
    return {
      queueType, tier: tier.toUpperCase(), division: DIVISIONS[q.tier_info?.division ?? 0] || 'NA', leaguePoints: q.tier_info?.lp ?? 0,
      wins: q.win ?? 0, losses: q.lose ?? 0,
    };
  };
  return { solo: queue('SOLORANKED', 'RANKED_SOLO_5x5'), flex: queue('FLEXRANKED', 'RANKED_FLEX_SR') };
}

const LANES: Record<string, { lane: string; role: string }> = {
  TOP: { lane: 'TOP', role: 'SOLO' }, JUNGLE: { lane: 'JUNGLE', role: 'NONE' }, MID: { lane: 'MIDDLE', role: 'SOLO' },
  ADC: { lane: 'BOTTOM', role: 'CARRY' }, SUPPORT: { lane: 'BOTTOM', role: 'SUPPORT' },
};

function toGame(g: OpggGame): LcuGame {
  const participants = g.participants ?? g.teams.flatMap((t) => t.participants ?? []);
  const lcu: LcuParticipant[] = participants.map((p, i) => {
    const raw = p.items ?? [];
    const trinket = raw.find((id) => TRINKETS.has(id)) ?? 0;
    const items = [...raw.filter((id) => !TRINKETS.has(id)), 0, 0, 0, 0, 0, 0].slice(0, 6);
    const s = p.stats;
    return {
      participantId: i + 1,
      teamId: p.team_key === 'RED' ? 200 : 100,
      championId: p.champion_id,
      spell1Id: p.spells?.[0] ?? 0,
      spell2Id: p.spells?.[1] ?? 0,
      timeline: LANES[p.position ?? ''] ?? { lane: 'NONE', role: 'NONE' },
      stats: {
        win: s.result === 'WIN',
        kills: s.kill, deaths: s.death, assists: s.assist,
        totalMinionsKilled: s.minion_kill, neutralMinionsKilled: s.neutral_minion_kill,
        goldEarned: s.gold_earned, totalDamageDealtToChampions: s.total_damage_dealt_to_champions,
        champLevel: s.champion_level,
        item0: items[0]!, item1: items[1]!, item2: items[2]!, item3: items[3]!, item4: items[4]!, item5: items[5]!, item6: trinket,
        perk0: p.rune?.primary_rune_id ?? 0, perkPrimaryStyle: p.rune?.primary_page_id ?? 0, perkSubStyle: p.rune?.secondary_page_id ?? 0,
        // OP.GG marks remakes as neither a win nor a loss.
        gameEndedInEarlySurrender: s.result !== 'WIN' && s.result !== 'LOSE',
      },
    };
  });
  return {
    gameId: opggGameNumber(g.id),
    gameCreation: Date.parse(g.created_at),
    gameDuration: g.game_length_second,
    queueId: QUEUES[g.game_type] ?? -1,
    mapId: MAPS[g.game_map] ?? 0,
    gameMode: g.game_type,
    participants: lcu,
    participantIdentities: participants.map((p, i) => ({
      participantId: i + 1,
      player: { puuid: p.summoner?.puuid ?? '', gameName: p.summoner?.game_name, tagLine: p.summoner?.tagline, profileIcon: iconId(p.summoner?.profile_image_url) },
    })),
    teams: g.teams.map((t) => ({ teamId: t.key === 'RED' ? 200 : 100, win: t.game_stat?.is_win ? 'Win' : 'Fail' })),
  };
}

/** A player's recent games, each holding just that player, with the keys to open each one. */
export function opggMatches(parsed: unknown): { games: LcuGame[]; keys: Map<number, OpggGameKey> } {
  const list = (data(parsed).game_history ?? []) as OpggGame[];
  const keys = new Map(list.map((g) => [opggGameNumber(g.id), { id: g.id, createdAt: g.created_at }]));
  return { games: list.map(toGame), keys };
}

/** One game with all ten players. */
export function opggGame(parsed: unknown): LcuGame {
  const g = data(parsed).game_detail as OpggGame | undefined;
  if (!g) throw new OpggParseError('OP.GG answer has no game');
  return toGame(g);
}
