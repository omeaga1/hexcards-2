// Shapes of the League Client (LCU) endpoints Hex Cards reads and writes.
// Only the fields we use are typed; the client sends more.

/** One rune tree from `GET /lol-perks/v1/styles`. */
export interface PerkStyle {
  id: number;
  name: string;
  allowedSubStyles: number[];
  slots: PerkSlot[];
}

export interface PerkSlot {
  /** `kKeyStone`, `kMixedRegularSplashable` (the three minor rows) or `kStatMod` (the three shard rows). */
  type: 'kKeyStone' | 'kMixedRegularSplashable' | 'kStatMod' | (string & {});
  slotLabel: string;
  perks: number[];
}

/** A rune page from `GET /lol-perks/v1/pages`. */
export interface LcuPerkPage {
  id: number;
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  current: boolean;
  isEditable: boolean;
  isDeletable: boolean;
}

/** `GET /lol-perks/v1/inventory` */
export interface LcuPerkInventory {
  ownedPageCount: number;
}

/** Body for `POST /lol-perks/v1/pages` and `PUT /lol-perks/v1/pages/{id}`. */
export interface LcuPerkPageWrite {
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  current: boolean;
}

/** One item set inside `GET/PUT /lol-item-sets/v1/item-sets/{summonerId}/sets`. */
export interface LcuItemSet {
  uid: string;
  title: string;
  type: string;
  map: string;
  mode: string;
  sortrank: number;
  startedFrom: string;
  associatedChampions: number[];
  associatedMaps: number[];
  preferredItemSlots: unknown[];
  blocks: LcuItemSetBlock[];
}

export interface LcuItemSetBlock {
  type: string;
  hideIfSummonerSpell: string;
  showIfSummonerSpell: string;
  items: { id: string; count: number }[];
}

/** Whole document for `GET/PUT /lol-item-sets/v1/item-sets/{summonerId}/sets`. */
export interface LcuItemSetsDoc {
  accountId: number;
  timestamp: number;
  itemSets: LcuItemSet[];
}

// Player stats: the profile, rank and match history the client shows on a player's profile.

/** `GET /lol-summoner/v1/current-summoner`, `/lol-summoner/v1/summoners?name=` and `/lol-summoner/v2/summoners/puuid/{puuid}`. */
export interface LcuSummoner {
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  /** Older clients only. */
  displayName?: string;
  privacy?: 'PUBLIC' | 'PRIVATE' | (string & {});
}

/** One entry from `GET /player-account/aliases/v1/lookup?gameName=&tagLine=`. */
export interface LcuAlias {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** One queue from `GET /lol-ranked/v1/ranked-stats/{puuid}`. */
export interface LcuRankedQueue {
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR' | (string & {});
  /** "IRON" to "CHALLENGER", or "" / "NONE" when unranked. */
  tier: string;
  /** "I" to "IV", or "NA" for Master and above. */
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  isProvisional?: boolean;
  provisionalGamesRemaining?: number;
}

export interface LcuRankedStats {
  queueMap?: Record<string, LcuRankedQueue>;
  queues?: LcuRankedQueue[];
}

export interface LcuParticipantStats {
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  champLevel: number;
  item0: number; item1: number; item2: number; item3: number; item4: number; item5: number; item6: number;
  perk0: number;
  perkPrimaryStyle: number;
  perkSubStyle: number;
  /** True for a remake: nobody's record counts it. */
  gameEndedInEarlySurrender?: boolean;
}

export interface LcuParticipant {
  participantId: number;
  teamId: number;
  championId: number;
  spell1Id: number;
  spell2Id: number;
  stats: LcuParticipantStats;
  /** `lane` is TOP, JUNGLE, MIDDLE or BOTTOM; `role` tells a bot laner (CARRY) from a support (SUPPORT). */
  timeline?: { lane?: string; role?: string };
}

export interface LcuParticipantIdentity {
  participantId: number;
  player: { puuid: string; gameName?: string; tagLine?: string; summonerName?: string; profileIcon?: number };
}

/**
 * One game. From the match history list it holds only the looked-up player; from
 * `GET /lol-match-history/v1/games/{gameId}` it holds all ten.
 */
export interface LcuGame {
  gameId: number;
  /** Epoch milliseconds. */
  gameCreation: number;
  /** Seconds. */
  gameDuration: number;
  queueId: number;
  mapId: number;
  gameMode: string;
  participants: LcuParticipant[];
  participantIdentities: LcuParticipantIdentity[];
  teams?: { teamId: number; win: 'Win' | 'Fail' | (string & {}) }[];
}

/** `GET /lol-match-history/v1/products/lol/{puuid}/matches?begIndex=&endIndex=` */
export interface LcuMatchHistory {
  games: { games: LcuGame[]; gameCount?: number };
}
