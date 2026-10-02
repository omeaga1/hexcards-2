import { z } from 'zod';

// The build files the pipeline publishes and the app downloads:
// builds/{patch}/{championKey}.json, one ChampionBuilds per role.

/** Team-composition traits that trigger swaps and move the recommendation. */
export const Trait = z.enum([
  'enemy-heavy-healing',
  'enemy-tanks-2plus',
  'enemy-mostly-ap',
  'enemy-mostly-ad',
  'enemy-ap-burst',
  'enemy-ad-burst',
  'enemy-heavy-cc',
  'enemy-shields',
  'ally-no-frontline',
  'ally-no-ap',
  'ally-no-engage',
]);
export type Trait = z.infer<typeof Trait>;

export const TRAIT_LABELS: Record<Trait, string> = {
  'enemy-heavy-healing': 'vs heavy healing',
  'enemy-tanks-2plus': 'vs 2+ tanks',
  'enemy-mostly-ap': 'vs mostly AP',
  'enemy-mostly-ad': 'vs mostly AD',
  'enemy-ap-burst': 'vs AP burst',
  'enemy-ad-burst': 'vs AD burst',
  'enemy-heavy-cc': 'vs heavy CC',
  'enemy-shields': 'vs shields',
  'ally-no-frontline': 'your team has no frontline',
  'ally-no-ap': 'your team has no AP',
  'ally-no-engage': 'your team has no engage',
};

/** A trait as the end of a sentence: "Swap vs mostly AP", "Swap when your team has no frontline". */
export const traitClause = (trait: Trait) => (TRAIT_LABELS[trait].startsWith('vs ') ? TRAIT_LABELS[trait] : `when ${TRAIT_LABELS[trait]}`);

export const Slot = z.enum(['start', 'first-back', 'core-1', 'core-2', 'core-3', 'boots', 'late-4', 'late-5', 'late-6']);
export type Slot = z.infer<typeof Slot>;

/** A rune page by perk ID: [keystone, primary ×3, secondary ×2, shard ×3]. */
export const RunePage = z.object({
  primaryStyleId: z.number().int(),
  subStyleId: z.number().int(),
  perkIds: z.array(z.number().int()).length(9),
});
export type RunePage = z.infer<typeof RunePage>;

export const CommonItem = z.object({
  itemId: z.number().int(),
  /** Share of this build's games that bought this item in this slot, 0–1. */
  share: z.number().min(0).max(1),
  /** Average game minute the item was completed. */
  avgMinute: z.number().optional(),
});

export const Swap = z.object({
  replacesSlot: Slot,
  itemId: z.number().int(),
  trigger: Trait,
  /** Plain-English timing, e.g. "Buy Executioner's Calling on your first back". */
  timing: z.string(),
  /** Components worth buying early, in order. */
  earlyComponents: z.array(z.number().int()).default([]),
  /** Average game minute it's finished. Missing in older files. */
  minute: z.number().optional(),
  evidence: z.object({
    /** Games with the trigger that bought it. */
    games: z.number().int(),
    /** Win rate with the swap minus without it, when the trigger is present. */
    winRateDelta: z.number(),
    /** Share of games that bought it with the trigger and without it. Missing in older files. */
    buyRate: z.tuple([z.number(), z.number()]).optional(),
  }),
});
export type Swap = z.infer<typeof Swap>;

export const BuildVariant = z.object({
  id: z.string(),
  label: z.string(),
  runes: RunePage,
  spells: z.tuple([z.number().int(), z.number().int()]),
  /** Ability max order, e.g. ["Q", "E", "W"]. R is always taken when available. */
  skillMaxOrder: z.array(z.enum(['Q', 'W', 'E'])).length(3),
  /** The ability leveled at each champion level, 1 through 18. */
  skillOrder: z.array(z.enum(['Q', 'W', 'E', 'R'])).length(18),
  slots: z.array(z.object({ slot: Slot, common: z.array(CommonItem).min(1) })),
  swaps: z.array(Swap),
  stats: z.object({
    games: z.number().int(),
    /** Share of the champion+role's games that used this variant, 0–1. */
    pickShare: z.number().min(0).max(1),
    winRate: z.number().min(0).max(1),
  }),
  /** [games, wins] among this build's games where each team trait was present. Missing in older files. */
  traitStats: z.partialRecord(Trait, z.tuple([z.number().int(), z.number().int()])).optional(),
});
export type BuildVariant = z.infer<typeof BuildVariant>;

const CORE_PATH: Slot[] = ['core-1', 'core-2', 'core-3'];

/**
 * Each slot's items are counted on their own, so an item bought 2nd in some games and 3rd in others
 * can lead both slots, and the path would show it twice. Here each item leads at most one core slot:
 * a later slot leads with its most built item that isn't already on the path. Shares don't change,
 * and the item it skipped stays in that slot's list.
 */
export function distinctCorePath(slots: BuildVariant['slots']): BuildVariant['slots'] {
  const taken = new Set<number>();
  const reordered = new Map<Slot, BuildVariant['slots'][number]>();
  for (const slot of CORE_PATH) {
    const s = slots.find((x) => x.slot === slot);
    const lead = s?.common.find((c) => !taken.has(c.itemId));
    if (!s || !lead) continue;
    taken.add(lead.itemId);
    if (lead !== s.common[0]) reordered.set(slot, { ...s, common: [lead, ...s.common.filter((c) => c !== lead)] });
  }
  return reordered.size === 0 ? slots : slots.map((s) => reordered.get(s.slot) ?? s);
}

export const ChampionBuilds = z.object({
  patch: z.string(),
  championId: z.number().int(),
  championKey: z.string(),
  role: z.enum(['top', 'jungle', 'middle', 'bottom', 'utility']),
  variants: z.array(BuildVariant).min(1).max(3),
});
export type ChampionBuilds = z.infer<typeof ChampionBuilds>;
