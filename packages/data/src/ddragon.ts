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

// Rune names, icons and summaries come from CommunityDragon, which mirrors the League client's own
// rune data (Data Dragon leaves out stat shards).
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default';

export interface RuneInfo {
  id: number;
  name: string;
  icon: string;
  summary: string;
}

export interface RuneData {
  perks: Map<number, RuneInfo>;
  styles: Map<number, RuneInfo>;
}

/** "/lol-game-data/assets/v1/perk-images/X.png" → CommunityDragon URL (which is all lowercase). */
const cdragonAsset = (path: string) => `${CDRAGON}/${path.replace(/^\/lol-game-data\/assets\//, '').toLowerCase()}`;

const stripTags = (html: string) => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export async function loadRunes(): Promise<RuneData> {
  const [perksRes, stylesRes] = await Promise.all([fetch(`${CDRAGON}/v1/perks.json`), fetch(`${CDRAGON}/v1/perkstyles.json`)]);
  if (!perksRes.ok || !stylesRes.ok) throw new Error(`CommunityDragon runes: HTTP ${perksRes.status}/${stylesRes.status}`);
  const perks = (await perksRes.json()) as { id: number; name: string; iconPath: string; shortDesc: string }[];
  const styles = (await stylesRes.json()) as { styles: { id: number; name: string; iconPath: string; tooltip: string }[] };
  return {
    perks: new Map(perks.map((p) => [p.id, { id: p.id, name: p.name, icon: cdragonAsset(p.iconPath), summary: stripTags(p.shortDesc) }])),
    styles: new Map(styles.styles.map((s) => [s.id, { id: s.id, name: s.name, icon: cdragonAsset(s.iconPath), summary: s.tooltip }])),
  };
}

export const itemIconUrl = (version: string, itemId: number) => `${CDN}/cdn/${version}/img/item/${itemId}.png`;
export const championIconUrl = (version: string, championKey: string) => `${CDN}/cdn/${version}/img/champion/${championKey}.png`;
