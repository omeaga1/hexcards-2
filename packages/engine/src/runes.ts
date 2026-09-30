import type { LcuPerkInventory, LcuPerkPage, LcuPerkPageWrite, PerkStyle, RunePage } from '@hexcards/data';

/** Every rune page Hex Cards writes starts with this, so we can recognise our own page. */
export const PAGE_PREFIX = 'HexCards: ';
const MAX_PAGE_NAME = 30;

export type RuneValidation = { ok: true } | { ok: false; errors: string[] };

/**
 * Checks a page against the client's current rune trees (`/lol-perks/v1/styles`)
 * before anything is sent. perkIds order: keystone, primary rows 1–3, two secondaries, shards 1–3.
 */
export function validateRunePage(page: RunePage, styles: PerkStyle[]): RuneValidation {
  const errors: string[] = [];
  const primary = styles.find((s) => s.id === page.primaryStyleId);
  const sub = styles.find((s) => s.id === page.subStyleId);
  if (!primary) errors.push(`Unknown primary tree ${page.primaryStyleId}.`);
  if (!sub) errors.push(`Unknown secondary tree ${page.subStyleId}.`);
  if (page.perkIds.length !== 9) errors.push(`Expected 9 runes, got ${page.perkIds.length}.`);
  if (!primary || !sub || errors.length > 0) return { ok: false, errors };

  if (primary.id === sub.id) errors.push('Primary and secondary trees must differ.');
  else if (!primary.allowedSubStyles.includes(sub.id)) errors.push(`${sub.name} can't be the secondary tree for ${primary.name}.`);

  const [keystone, p1, p2, p3, s1, s2, ...shards] = page.perkIds as [number, number, number, number, number, number, number, number, number];
  const keystoneRow = primary.slots.find((s) => s.type === 'kKeyStone');
  const primaryRows = primary.slots.filter((s) => s.type === 'kMixedRegularSplashable');
  const subRows = sub.slots.filter((s) => s.type === 'kMixedRegularSplashable');
  const shardRows = primary.slots.filter((s) => s.type === 'kStatMod');

  if (!keystoneRow?.perks.includes(keystone)) errors.push(`Rune ${keystone} isn't a ${primary.name} keystone.`);
  [p1, p2, p3].forEach((id, row) => {
    if (!primaryRows[row]?.perks.includes(id)) errors.push(`Rune ${id} isn't in ${primary.name} row ${row + 1}.`);
  });

  const subRowOf = (id: number) => subRows.findIndex((r) => r.perks.includes(id));
  const r1 = subRowOf(s1);
  const r2 = subRowOf(s2);
  if (r1 < 0) errors.push(`Rune ${s1} isn't in ${sub.name}'s minor rows.`);
  if (r2 < 0) errors.push(`Rune ${s2} isn't in ${sub.name}'s minor rows.`);
  if (r1 >= 0 && r1 === r2) errors.push(`Secondary runes ${s1} and ${s2} are in the same ${sub.name} row.`);

  shards.forEach((id, row) => {
    if (!shardRows[row]?.perks.includes(id)) errors.push(`Shard ${id} isn't valid in shard row ${row + 1}.`);
  });

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function toLcuPerkPage(page: RunePage, label: string): LcuPerkPageWrite {
  return {
    name: (PAGE_PREFIX + label).slice(0, MAX_PAGE_NAME).trim(),
    primaryStyleId: page.primaryStyleId,
    subStyleId: page.subStyleId,
    selectedPerkIds: [...page.perkIds],
    current: true,
  };
}

export type RunePageWritePlan =
  | { kind: 'update'; pageId: number }
  | { kind: 'create' }
  /** At the page limit and no Hex Cards page exists: the user picks a page to replace. */
  | { kind: 'choose'; candidates: LcuPerkPage[] };

/**
 * Decides where a rune page goes. Only ever updates the page Hex Cards created,
 * found by the ID we saved or by our name prefix. Never picks one of the user's own pages.
 */
export function planRunePageWrite(pages: LcuPerkPage[], inventory: LcuPerkInventory, savedPageId?: number): RunePageWritePlan {
  const ours =
    pages.find((p) => p.id === savedPageId && p.isEditable) ??
    pages.find((p) => p.isEditable && p.name.startsWith(PAGE_PREFIX));
  if (ours) return { kind: 'update', pageId: ours.id };

  const customPages = pages.filter((p) => p.isDeletable).length;
  if (customPages < inventory.ownedPageCount) return { kind: 'create' };

  return { kind: 'choose', candidates: pages.filter((p) => p.isEditable) };
}
