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

export const itemIconUrl = (version: string, itemId: number) => `${CDN}/cdn/${version}/img/item/${itemId}.png`;
export const championIconUrl = (version: string, championKey: string) => `${CDN}/cdn/${version}/img/champion/${championKey}.png`;
