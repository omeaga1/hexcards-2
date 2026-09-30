import type { BuildVariant, ChampionBuilds, LcuItemSetsDoc, LcuPerkInventory, LcuPerkPage, PerkStyle, Swap } from '@hexcards/data';
import { buildItemSet, mergeItemSets } from './itemSets';
import { planRunePageWrite, toLcuPerkPage, validateRunePage } from './runes';

/** The desktop app's bridge to the League client. Tests use an in-memory fake. */
export interface LcuClient {
  request<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<{ status: number; body: T }>;
}

const ok = (status: number) => status >= 200 && status < 300;

export class ImportError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
  }
}

async function get<T>(client: LcuClient, path: string): Promise<T> {
  const res = await client.request<T>('GET', path);
  if (!ok(res.status)) throw new ImportError(`The League client refused ${path} (status ${res.status}).`);
  return res.body;
}

export type RuneImportResult =
  | { kind: 'done'; pageId: number }
  /** At the page limit with no Hex Cards page: ask which page to replace, then call again with `replacePageId`. */
  | { kind: 'choose'; candidates: LcuPerkPage[] };

export async function importRunes(
  client: LcuClient,
  variant: BuildVariant,
  options: { savedPageId?: number; replacePageId?: number } = {},
): Promise<RuneImportResult> {
  const styles = await get<PerkStyle[]>(client, '/lol-perks/v1/styles');
  const validation = validateRunePage(variant.runes, styles);
  if (!validation.ok) throw new ImportError(`The ${variant.label} rune page doesn't match this patch's runes, so nothing was changed.`, validation.errors);

  const pages = await get<LcuPerkPage[]>(client, '/lol-perks/v1/pages');
  const inventory = await get<LcuPerkInventory>(client, '/lol-perks/v1/inventory');
  const plan = options.replacePageId !== undefined
    ? { kind: 'update' as const, pageId: options.replacePageId }
    : planRunePageWrite(pages, inventory, options.savedPageId);
  if (plan.kind === 'choose') return plan;

  const page = toLcuPerkPage(variant.runes, variant.label);
  let pageId: number;
  if (plan.kind === 'update') {
    const res = await client.request('PUT', `/lol-perks/v1/pages/${plan.pageId}`, { ...page, id: plan.pageId });
    if (!ok(res.status)) throw new ImportError(`The League client wouldn't update the rune page (status ${res.status}).`);
    pageId = plan.pageId;
  } else {
    const res = await client.request<LcuPerkPage>('POST', '/lol-perks/v1/pages', page);
    if (!ok(res.status)) throw new ImportError(`The League client wouldn't create a rune page (status ${res.status}).`);
    pageId = res.body.id;
  }
  const current = await client.request('PUT', '/lol-perks/v1/currentpage', pageId);
  if (!ok(current.status)) throw new ImportError(`The rune page was saved but couldn't be selected (status ${current.status}).`);
  return { kind: 'done', pageId };
}

/** Writes one item set per build variant, so every variant is available in the in-game shop. */
export async function importItemSets(client: LcuClient, champion: ChampionBuilds, activeSwaps: (variant: BuildVariant) => Swap[]): Promise<void> {
  const summoner = await get<{ summonerId: number }>(client, '/lol-summoner/v1/current-summoner');
  const path = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
  const doc = await get<LcuItemSetsDoc>(client, path);
  const ours = champion.variants.map((v) => buildItemSet(champion, v, activeSwaps(v)));
  const res = await client.request('PUT', path, mergeItemSets(doc, champion.championId, ours));
  if (!ok(res.status)) throw new ImportError(`The League client wouldn't save the item sets (status ${res.status}).`);
}

export const FLASH = 4;

/** Sets summoner spells, keeping Flash on the key the player uses (D is spell 1, F is spell 2). */
export async function importSpells(client: LcuClient, spells: [number, number], flashKey: 'D' | 'F'): Promise<void> {
  const [a, b] = spells;
  const flashFirst = a === FLASH ? [a, b] : b === FLASH ? [b, a] : [a, b];
  const [spell1Id, spell2Id] = flashKey === 'D' || !flashFirst.includes(FLASH) ? flashFirst : [flashFirst[1], flashFirst[0]];
  const res = await client.request('PATCH', '/lol-champ-select/v1/session/my-selection', { spell1Id, spell2Id });
  if (!ok(res.status)) throw new ImportError(`The League client wouldn't set summoner spells (status ${res.status}).`);
}
