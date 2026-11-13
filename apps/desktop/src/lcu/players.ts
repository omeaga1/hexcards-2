import type { LcuAlias, LcuGame, LcuMatchHistory, LcuRankedQueue, LcuRankedStats, LcuSummoner } from '@hexcards/data';
import type { LcuClient } from '@hexcards/engine';

// Player lookups through the League client: the same profile, rank and match history the client
// shows on a player's profile, for players on your own server. No Riot API key is involved.

/** What Hex Cards remembers about a player: enough to show them in a list and look them up again. */
export interface PlayerRef {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
}

export class PlayerLookupError extends Error {}

export const toRef = (s: LcuSummoner): PlayerRef => ({ puuid: s.puuid, gameName: s.gameName, tagLine: s.tagLine, profileIconId: s.profileIconId });

/** encodeURIComponent leaves a few characters bare; the app's request allowlist only takes percent-encoding. */
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export async function currentPlayer(client: LcuClient): Promise<LcuSummoner> {
  const res = await client.request<LcuSummoner>('GET', '/lol-summoner/v1/current-summoner');
  if (res.status !== 200) throw new PlayerLookupError('The League client didn\'t say who is signed in.');
  return res.body;
}

export async function summonerByPuuid(client: LcuClient, puuid: string): Promise<LcuSummoner> {
  const res = await client.request<LcuSummoner>('GET', `/lol-summoner/v2/summoners/puuid/${puuid}`);
  if (res.status !== 200) throw new PlayerLookupError('The League client couldn\'t find that player.');
  return res.body;
}

/** A player on your server by Riot ID, or null when there's nobody by that name. */
export async function findPlayer(client: LcuClient, gameName: string, tagLine: string): Promise<LcuSummoner | null> {
  const byName = await client.request<LcuSummoner>('GET', `/lol-summoner/v1/summoners?name=${encode(`${gameName}#${tagLine}`)}`);
  if (byName.status === 200 && byName.body?.puuid) return byName.body;
  // Newer clients look Riot IDs up through the account service instead.
  const alias = await client.request<LcuAlias[]>('GET', `/player-account/aliases/v1/lookup?gameName=${encode(gameName)}&tagLine=${encode(tagLine)}`);
  const puuid = alias.status === 200 && Array.isArray(alias.body) ? alias.body[0]?.puuid : undefined;
  if (!puuid) return null;
  return summonerByPuuid(client, puuid);
}

export interface Ranks {
  solo: LcuRankedQueue | null;
  flex: LcuRankedQueue | null;
}

const isRanked = (q: LcuRankedQueue | undefined): q is LcuRankedQueue => !!q && !!q.tier && q.tier !== 'NONE' && q.tier !== 'UNRANKED';

export async function rankedStats(client: LcuClient, puuid: string): Promise<Ranks> {
  const res = await client.request<LcuRankedStats>('GET', `/lol-ranked/v1/ranked-stats/${puuid}`);
  if (res.status !== 200) return { solo: null, flex: null };
  const queue = (type: string) => res.body.queueMap?.[type] ?? res.body.queues?.find((q) => q.queueType === type);
  const [solo, flex] = [queue('RANKED_SOLO_5x5'), queue('RANKED_FLEX_SR')];
  return { solo: isRanked(solo) ? solo : null, flex: isRanked(flex) ? flex : null };
}

/** How many games one history request asks for. The client caps a single request at 20. */
export const HISTORY_PAGE = 20;

/** One page of a player's match history, from `begin` (0 is the newest game). */
export async function matchHistory(client: LcuClient, puuid: string, begin: number): Promise<LcuGame[]> {
  const res = await client.request<LcuMatchHistory>('GET', `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${begin}&endIndex=${begin + HISTORY_PAGE}`);
  if (res.status === 403) throw new PlayerLookupError('This player keeps their match history private.');
  if (res.status !== 200) throw new PlayerLookupError(`The League client couldn't load match history (status ${res.status}).`);
  return res.body?.games?.games ?? [];
}

/** One game with all ten players. */
export async function gameDetail(client: LcuClient, gameId: number): Promise<LcuGame> {
  const res = await client.request<LcuGame>('GET', `/lol-match-history/v1/games/${gameId}`);
  if (res.status !== 200) throw new PlayerLookupError(`The League client couldn't load that game (status ${res.status}).`);
  return res.body;
}
