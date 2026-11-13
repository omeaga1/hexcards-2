import {
  OPGG_GAME_FIELDS, OPGG_MATCH_FIELDS, OPGG_PROFILE_FIELDS, opggGame, opggMatches, opggRanks, opggSummoner, parseOpgg, regionFromClient,
  type LcuAlias, type LcuGame, type LcuMatchHistory, type LcuRankedQueue, type LcuRankedStats, type LcuSummoner, type OpggGameKey, type Region,
} from '@hexcards/data';
import type { LcuClient } from '@hexcards/engine';

// Player lookups come from one of two places:
//   - the League client, when it's running and the player is on your server: the freshest data,
//     exactly what the client's own profile pages show;
//   - OP.GG's public data service otherwise: any region, no League needed, no API key.
// Both are reshaped into the client's own shapes, so the stats and pages don't care which.

/** What Hex Cards remembers about a player: enough to list them and look them up again. */
export interface PlayerRef {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  region: Region;
}

export class PlayerLookupError extends Error {}

/** Same player whichever source found them: the client and OP.GG use different PUUID formats. */
export const playerKey = (p: { gameName: string; tagLine: string; region: string }) => `${p.region}:${p.gameName}#${p.tagLine}`.toLowerCase();

export const toRef = (s: LcuSummoner, region: Region): PlayerRef => ({
  puuid: s.puuid, gameName: s.gameName, tagLine: s.tagLine, profileIconId: s.profileIconId, region,
});

export interface Ranks {
  solo: LcuRankedQueue | null;
  flex: LcuRankedQueue | null;
}

export interface PlayerSource {
  kind: 'client' | 'opgg';
  /** For the page: where the numbers come from. */
  label: string;
  /** Whether older games can be loaded past the first pages. */
  paged: boolean;
  /** A player by Riot ID, or null when there's nobody by that name. */
  find(gameName: string, tagLine: string): Promise<LcuSummoner | null>;
  /** The player as this source knows them (its own PUUID). Throws if they can't be found. */
  resolve(ref: PlayerRef): Promise<LcuSummoner>;
  ranks(player: LcuSummoner): Promise<Ranks>;
  /** One page of games from `begin` (0 is the newest). Empty past the end. */
  history(player: LcuSummoner, begin: number): Promise<LcuGame[]>;
  /** One game with all ten players. */
  game(player: LcuSummoner, gameId: number): Promise<LcuGame>;
}

/** How many games one history request asks for. The client and OP.GG both cap a request at 20. */
export const HISTORY_PAGE = 20;

// League client ------------------------------------------------------------------------------

/** encodeURIComponent leaves a few characters bare; the app's request allowlist only takes percent-encoding. */
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** The client's PUUIDs are UUIDs; OP.GG's are long Riot API strings. */
const isClientPuuid = (puuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(puuid) || puuid.startsWith('demo-');

export async function currentPlayer(client: LcuClient): Promise<LcuSummoner> {
  const res = await client.request<LcuSummoner>('GET', '/lol-summoner/v1/current-summoner');
  if (res.status !== 200) throw new PlayerLookupError('The League client didn\'t say who is signed in.');
  return res.body;
}

/** The server the signed-in account plays on, as an OP.GG region. */
export async function clientRegion(client: LcuClient): Promise<Region | null> {
  const res = await client.request<{ region?: string; webRegion?: string }>('GET', '/riotclient/region-locale').catch(() => null);
  return res?.status === 200 ? regionFromClient(res.body.region) ?? regionFromClient(res.body.webRegion) : null;
}

const isRanked = (q: LcuRankedQueue | undefined): q is LcuRankedQueue => !!q && !!q.tier && q.tier !== 'NONE' && q.tier !== 'UNRANKED';

export function clientSource(client: LcuClient): PlayerSource {
  const byPuuid = async (puuid: string) => {
    const res = await client.request<LcuSummoner>('GET', `/lol-summoner/v2/summoners/puuid/${puuid}`);
    if (res.status !== 200) throw new PlayerLookupError('The League client couldn\'t find that player.');
    return res.body;
  };
  const find = async (gameName: string, tagLine: string) => {
    const byName = await client.request<LcuSummoner>('GET', `/lol-summoner/v1/summoners?name=${encode(`${gameName}#${tagLine}`)}`);
    if (byName.status === 200 && byName.body?.puuid) return byName.body;
    // Newer clients look Riot IDs up through the account service instead.
    const alias = await client.request<LcuAlias[]>('GET', `/player-account/aliases/v1/lookup?gameName=${encode(gameName)}&tagLine=${encode(tagLine)}`);
    const puuid = alias.status === 200 && Array.isArray(alias.body) ? alias.body[0]?.puuid : undefined;
    return puuid ? byPuuid(puuid) : null;
  };
  return {
    kind: 'client',
    label: 'your League client',
    paged: true,
    find,
    async resolve(ref) {
      if (isClientPuuid(ref.puuid)) return byPuuid(ref.puuid);
      const found = await find(ref.gameName, ref.tagLine);
      if (!found) throw new PlayerLookupError(`No player called ${ref.gameName}#${ref.tagLine} on your server any more.`);
      return found;
    },
    async ranks(player) {
      const res = await client.request<LcuRankedStats>('GET', `/lol-ranked/v1/ranked-stats/${player.puuid}`);
      if (res.status !== 200) return { solo: null, flex: null };
      const queue = (type: string) => res.body.queueMap?.[type] ?? res.body.queues?.find((q) => q.queueType === type);
      const [solo, flex] = [queue('RANKED_SOLO_5x5'), queue('RANKED_FLEX_SR')];
      return { solo: isRanked(solo) ? solo : null, flex: isRanked(flex) ? flex : null };
    },
    async history(player, begin) {
      const res = await client.request<LcuMatchHistory>('GET', `/lol-match-history/v1/products/lol/${player.puuid}/matches?begIndex=${begin}&endIndex=${begin + HISTORY_PAGE}`);
      if (res.status === 403) throw new PlayerLookupError('This player keeps their match history private.');
      if (res.status !== 200) throw new PlayerLookupError(`The League client couldn't load match history (status ${res.status}).`);
      return res.body?.games?.games ?? [];
    },
    async game(_player, gameId) {
      const res = await client.request<LcuGame>('GET', `/lol-match-history/v1/games/${gameId}`);
      if (res.status !== 200) throw new PlayerLookupError(`The League client couldn't load that game (status ${res.status}).`);
      return res.body;
    },
  };
}

// OP.GG ---------------------------------------------------------------------------------------

/** Sends one OP.GG lookup and returns its text answer. The desktop app sends it from Rust (no CORS there). */
export type OpggCall = (tool: string, args: Record<string, unknown>) => Promise<string>;

export function opggSource(call: OpggCall, region: Region): PlayerSource {
  // One profile answer has both the player and their rank; keep it for the ranks call right after.
  const profiles = new Map<string, Promise<unknown>>();
  const keys = new Map<number, OpggGameKey>();
  const profile = (gameName: string, tagLine: string) => {
    const k = `${gameName}#${tagLine}`.toLowerCase();
    let p = profiles.get(k);
    if (!p) {
      p = call('lol_get_summoner_profile', { game_name: gameName, tag_line: tagLine, region, desired_output_fields: OPGG_PROFILE_FIELDS }).then(parseOpgg);
      p.catch(() => profiles.delete(k));
      profiles.set(k, p);
    }
    return p;
  };
  const notFound = (err: unknown) => /not found/i.test(String((err as Error)?.message ?? err));
  return {
    kind: 'opgg',
    label: 'OP.GG',
    paged: false,
    async find(gameName, tagLine) {
      try {
        return opggSummoner(await profile(gameName, tagLine));
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    },
    async resolve(ref) {
      try {
        return opggSummoner(await profile(ref.gameName, ref.tagLine));
      } catch (err) {
        throw new PlayerLookupError(notFound(err) ? `OP.GG has no player called ${ref.gameName}#${ref.tagLine} in ${ref.region}.` : (err as Error).message);
      }
    },
    async ranks(player) {
      return opggRanks(await profile(player.gameName, player.tagLine));
    },
    async history(player, begin) {
      // OP.GG answers with the latest 20 games and has no paging.
      if (begin > 0) return [];
      const text = await call('lol_list_summoner_matches', {
        game_name: player.gameName, tag_line: player.tagLine, region, limit: HISTORY_PAGE, desired_output_fields: OPGG_MATCH_FIELDS,
      });
      const { games, keys: found } = opggMatches(parseOpgg(text));
      found.forEach((v, k) => keys.set(k, v));
      return games;
    },
    async game(player, gameId) {
      const key = keys.get(gameId);
      if (!key) throw new PlayerLookupError('Couldn\'t find that game on OP.GG.');
      const text = await call('lol_get_summoner_game_detail', {
        region, game_id: key.id, created_at: key.createdAt, focus_riot_id: `${player.gameName}#${player.tagLine}`, desired_output_fields: OPGG_GAME_FIELDS,
      });
      return opggGame(parseOpgg(text));
    },
  };
}
