// Riot's Data Dragon CDN: item names, costs and icons for the current patch. No API key needed.
const CDN = 'https://ddragon.leagueoflegends.com';

export interface ItemInfo {
  id: number;
  name: string;
  cost: number;
  /** Riot's one-line summary, e.g. "Grants Attack Speed and Critical Strike". */
  plaintext: string;
}

export async function latestVersion(): Promise<string> {
  const res = await fetch(`${CDN}/api/versions.json`);
  if (!res.ok) throw new Error(`Data Dragon versions: HTTP ${res.status}`);
  const versions = (await res.json()) as string[];
  if (!versions[0]) throw new Error('Data Dragon returned no versions.');
  return versions[0];
}

export async function loadItems(version: string): Promise<Map<number, ItemInfo>> {
  const res = await fetch(`${CDN}/cdn/${version}/data/en_US/item.json`);
  if (!res.ok) throw new Error(`Data Dragon items: HTTP ${res.status}`);
  const json = (await res.json()) as { data: Record<string, { name: string; plaintext: string; gold: { total: number } }> };
  return new Map(
    Object.entries(json.data).map(([id, item]) => [
      Number(id),
      { id: Number(id), name: item.name, cost: item.gold.total, plaintext: item.plaintext },
    ]),
  );
}

export interface ChampionInfo {
  /** Numeric ID the League client uses, e.g. 24. */
  id: number;
  /** Data Dragon key used in file names, e.g. "Jax", "MonkeyKing". */
  key: string;
  name: string;
}

/** Champions by the numeric ID the League client reports in champ select. */
export async function loadChampions(version: string): Promise<Map<number, ChampionInfo>> {
  const res = await fetch(`${CDN}/cdn/${version}/data/en_US/champion.json`);
  if (!res.ok) throw new Error(`Data Dragon champions: HTTP ${res.status}`);
  const json = (await res.json()) as { data: Record<string, { key: string; id: string; name: string }> };
  return new Map(
    Object.values(json.data).map((c) => [Number(c.key), { id: Number(c.key), key: c.id, name: c.name }]),
  );
}

export interface AbilityInfo {
  key: 'P' | 'Q' | 'W' | 'E' | 'R';
  name: string;
  icon: string;
  description: string;
}

/** A champion's passive and Q, W, E, R: names, icons and Riot's description. */
export async function loadAbilities(version: string, championKey: string): Promise<AbilityInfo[]> {
  const res = await fetch(`${CDN}/cdn/${version}/data/en_US/champion/${championKey}.json`);
  if (!res.ok) throw new Error(`Data Dragon ${championKey}: HTTP ${res.status}`);
  type Spell = { name: string; description: string; image: { full: string } };
  const json = (await res.json()) as { data: Record<string, { passive: Spell; spells: Spell[] }> };
  const champ = json.data[championKey];
  if (!champ) throw new Error(`Data Dragon has no ${championKey}.`);
  const keys = ['Q', 'W', 'E', 'R'] as const;
  return [
    { key: 'P', name: champ.passive.name, icon: `${CDN}/cdn/${version}/img/passive/${champ.passive.image.full}`, description: stripTags(champ.passive.description) },
    ...champ.spells.slice(0, 4).map((s, i) => ({
      key: keys[i]!,
      name: s.name,
      icon: `${CDN}/cdn/${version}/img/spell/${s.image.full}`,
      description: stripTags(s.description),
    })),
  ];
}

// Rune names, summaries and tree layouts come from the League client's own rune data, which
// CommunityDragon mirrors (Data Dragon leaves out stat shards). CommunityDragon can take many seconds
// to answer, or not answer at all, so the pipeline copies what the app needs into each patch's
// runes.json next to the builds, and the app reads that first. Icons come from Data Dragon, which
// hosts every rune and tree icon under the client's own paths.
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

export interface RuneInfo {
  id: number;
  name: string;
  icon: string;
  summary: string;
}

/** A rune tree, laid out the way the client shows it. */
export interface RuneStyle extends RuneInfo {
  /** Perk IDs row by row: the keystones, then three rows of runes. */
  rows: number[][];
  /** Stat shard rows (offense, flex, defense). Every tree has the same ones. */
  shardRows: number[][];
}

export interface RuneData {
  perks: Map<number, RuneInfo>;
  styles: Map<number, RuneStyle>;
}

/** The published <patch>/runes.json: the same as RuneData, as plain lists. */
export interface PublishedRunes {
  perks: RuneInfo[];
  styles: RuneStyle[];
}

/** The client's perks.json and perkstyles.json, as CommunityDragon serves them. */
export type ClientPerk = { id: number; name: string; iconPath: string; shortDesc: string };
type ClientSlot = { type: string; perks: number[] };
export type ClientPerkStyles = { styles: { id: number; name: string; iconPath: string; tooltip: string; slots: ClientSlot[] }[] };

const ASSETS = '/lol-game-data/assets/v1/';
/** "/lol-game-data/assets/v1/perk-images/X.png" → the same image on Data Dragon (else CommunityDragon, all lowercase). */
const runeIcon = (path: string) =>
  path.startsWith(ASSETS) ? `${CDN}/cdn/img/${path.slice(ASSETS.length)}` : `${CDRAGON}/${path.replace(/^\/lol-game-data\/assets\//, '').toLowerCase()}`;

const stripTags = (html: string) => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** The client's rune data, cut down to what the rune page shows. The pipeline publishes this. */
export function publishedRunes(perks: ClientPerk[], styles: ClientPerkStyles): PublishedRunes {
  const rowsOf = (slots: ClientSlot[], stat: boolean) => slots.filter((slot) => (slot.type === 'kStatMod') === stat).map((slot) => slot.perks);
  // Only perks that sit in a tree: the rest are retired runes and internal entries.
  const used = new Set(styles.styles.flatMap((s) => (s.slots ?? []).flatMap((slot) => slot.perks)));
  return {
    perks: perks.filter((p) => used.has(p.id)).map((p) => ({ id: p.id, name: p.name, icon: runeIcon(p.iconPath), summary: stripTags(p.shortDesc) })),
    styles: styles.styles.map((s) => ({
      id: s.id,
      name: s.name,
      icon: runeIcon(s.iconPath),
      summary: s.tooltip,
      rows: rowsOf(s.slots ?? [], false),
      shardRows: rowsOf(s.slots ?? [], true),
    })),
  };
}

export const toRuneData = (r: PublishedRunes): RuneData => ({
  perks: new Map(r.perks.map((p) => [p.id, p])),
  styles: new Map(r.styles.map((s) => [s.id, s])),
});

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Rune names, icons, summaries and tree layouts: from the patch's published runes.json, or straight
 * from CommunityDragon for patches published before it existed or if that file can't be reached.
 */
export async function loadRunes(base: string, patch: string): Promise<RuneData> {
  try {
    const published = await fetchJson<PublishedRunes>(`${base}/${patch}/runes.json`, 10_000);
    if (published.perks?.length && published.styles?.length) return toRuneData(published);
  } catch {
    // Falls through to CommunityDragon.
  }
  const [perks, styles] = await Promise.all([
    fetchJson<ClientPerk[]>(`${CDRAGON}/v1/perks.json`, 45_000),
    fetchJson<ClientPerkStyles>(`${CDRAGON}/v1/perkstyles.json`, 45_000),
  ]);
  return toRuneData(publishedRunes(perks, styles));
}

export const itemIconUrl = (version: string, itemId: number) => `${CDN}/cdn/${version}/img/item/${itemId}.png`;
// Splash art file names match the champion key, except where Riot capitalizes differently.
// Checked against every champion on 16.19.
const ART_KEYS: Record<string, string> = { Fiddlesticks: 'FiddleSticks' };
const artKey = (championKey: string) => ART_KEYS[championKey] ?? championKey;

/** Square crop of the champion's default splash art. */
export const championTileUrl = (championKey: string) => `${CDN}/cdn/img/champion/tiles/${artKey(championKey)}_0.jpg`;
/** Wide (16:9) crop of the champion's default splash art. */
export const championSplashUrl = (championKey: string) => `${CDN}/cdn/img/champion/centered/${artKey(championKey)}_0.jpg`;
/** Tall (308×560) loading screen art, the champion's portrait on build cards. */
export const championLoadingUrl = (championKey: string) => `${CDN}/cdn/img/champion/loading/${artKey(championKey)}_0.jpg`;
export const championIconUrl = (version: string, championKey: string) => `${CDN}/cdn/${version}/img/champion/${championKey}.png`;

/** A player's profile icon. */
export const profileIconUrl = (version: string, iconId: number) => `${CDN}/cdn/${version}/img/profileicon/${iconId}.png`;

/** The ranked crest the client shows for a tier, e.g. "GOLD". */
export const rankEmblemUrl = (tier: string) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`;

/** Summoner's Rift summoner spells by ID, with their Data Dragon image key. */
export const SUMMONER_SPELLS: Record<number, { name: string; key: string }> = {
  4: { name: 'Flash', key: 'SummonerFlash' },
  12: { name: 'Teleport', key: 'SummonerTeleport' },
  14: { name: 'Ignite', key: 'SummonerDot' },
  11: { name: 'Smite', key: 'SummonerSmite' },
  6: { name: 'Ghost', key: 'SummonerHaste' },
  3: { name: 'Exhaust', key: 'SummonerExhaust' },
  7: { name: 'Heal', key: 'SummonerHeal' },
  21: { name: 'Barrier', key: 'SummonerBarrier' },
  1: { name: 'Cleanse', key: 'SummonerBoost' },
};

export const summonerSpellIconUrl = (version: string, key: string) => `${CDN}/cdn/${version}/img/spell/${key}.png`;
