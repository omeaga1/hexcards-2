import type { BuildVariant, GamePlayer, PerkStyle, RunePage, Slot, Swap, Trait } from '@hexcards/data';
import { validateRunePage } from '../runes';
import { validateSkillOrder } from '../skills';
import { chooseClusters, type Vector } from './cluster';
import { PROFILE_TAGS, type ItemCatalog, type ProfileTag } from './items';

/** Purchases in the first minute are the starting items. */
const START_SECONDS = 60;
/** A shopping trip: purchases within this many seconds of the trip's first purchase. */
const TRIP_SECONDS = 30;
/** Items under this share of a slot's games aren't listed as common. */
const MIN_ITEM_SHARE = 0.05;
const MAX_COMMON = 4;
/** Games need this many finished items to say anything about the build. */
const MIN_LEGENDARIES = 2;

const CORE_SLOTS: Slot[] = ['core-1', 'core-2', 'core-3', 'late-4', 'late-5', 'late-6'];
const FLASH = 4;

/** One player's game, reduced to what builds are made from. */
export interface BuildGame {
  win: boolean;
  runes: RunePage | null;
  spells: [number, number];
  skills: string;
  start: number[];
  firstBack: number[];
  /** Finished items in the order completed, with the minute each was bought. */
  legendaries: { id: number; minute: number }[];
  boots: { id: number; minute: number } | null;
  /** Every purchase, for finding which component players buy first. */
  buys: [number, number][];
  /** The matchup's traits (enemy healing, tanks, ...), when champion traits are known. */
  traits?: Set<Trait>;
}

export function toBuildGame(p: GamePlayer, items: ItemCatalog, traits?: Set<Trait>): BuildGame {
  const start = p.buys.filter(([id, t]) => t <= START_SECONDS && !items.isTrinket(id)).map(([id]) => id);
  const later = p.buys.filter(([, t]) => t > START_SECONDS);
  const tripStart = later[0]?.[1];
  const firstBack = tripStart === undefined
    ? []
    : later.filter(([id, t]) => t <= tripStart + TRIP_SECONDS && (items.isComponent(id) || items.isLegendary(id) || items.isBoots(id))).map(([id]) => id);
  const seen = new Set<number>();
  const legendaries = p.buys
    .filter(([id]) => items.isLegendary(id) && !seen.has(id) && seen.add(id))
    .map(([id, t]) => ({ id, minute: t / 60 }));
  return {
    win: p.win === 1,
    runes: p.runes ? { primaryStyleId: p.runes.p, subStyleId: p.runes.s, perkIds: p.runes.ids } : null,
    spells: p.spells,
    skills: p.skills,
    start,
    firstBack,
    legendaries,
    boots: ((b) => (b ? { id: b[0], minute: b[1] / 60 } : null))(p.buys.find(([id]) => items.isBoots(id))),
    buys: p.buys,
    ...(traits ? { traits } : {}),
  };
}

/** Average item profile of a game's first three finished items. */
function profileOf(game: BuildGame, items: ItemCatalog): Vector {
  const core = game.legendaries.slice(0, 3);
  return PROFILE_TAGS.map((tag) => core.reduce((sum, l) => sum + items.profile(l.id)[tag], 0) / core.length);
}

function mode<T>(values: T[], key: (v: T) => string = String): T | undefined {
  const counts = new Map<string, { value: T; n: number }>();
  for (const v of values) {
    const k = key(v);
    const entry = counts.get(k) ?? { value: v, n: 0 };
    entry.n++;
    counts.set(k, entry);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.value;
}

/** Items in a slot with their share of the games that filled the slot. */
function common(perGame: (number | undefined)[], total: number, minutes?: Map<number, number[]>) {
  const counts = new Map<number, number>();
  for (const id of perGame) if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([itemId, n]) => {
      const m = minutes?.get(itemId);
      return { itemId, share: n / total, ...(m?.length ? { avgMinute: Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 10) / 10 } : {}) };
    })
    .filter((c) => c.share >= MIN_ITEM_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_COMMON);
}

/** Items present in the start or first back of each game, by share of games. */
function commonSets(sets: number[][]) {
  const counts = new Map<number, number>();
  for (const set of sets) for (const id of new Set(set)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .map(([itemId, n]) => ({ itemId, share: n / sets.length }))
    .filter((c) => c.share >= 0.2)
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_COMMON);
}

const RANK_LIMIT = (rank: number) => 2 * rank - 1;

/**
 * Level by level, the most common choice among games that agree so far. Once too few games remain,
 * finish by League's rules: R at 6, 11, 16, otherwise the ability furthest along in the max order.
 */
export function skillOrderOf(skills: string[]): BuildVariant['skillOrder'] | null {
  let pool = skills.filter((s) => s.length >= 9);
  if (pool.length === 0) return null;
  let prefix = '';
  while (prefix.length < 18) {
    const next = mode(pool.map((s) => s[prefix.length]).filter((c): c is string => !!c));
    if (!next || pool.length < 10) break;
    prefix += next;
    pool = pool.filter((s) => s[prefix.length - 1] === next);
  }
  // Max order from games that finished maxing abilities: which basic reached 5 points first.
  const order = mode(
    skills.map((s) => {
      const ranks: Record<string, number> = { Q: 0, W: 0, E: 0 };
      const maxed: string[] = [];
      for (const c of s) if (c in ranks && ++ranks[c]! === 5) maxed.push(c);
      return [...maxed, ...['Q', 'W', 'E'].filter((k) => !maxed.includes(k)).sort((a, b) => ranks[b]! - ranks[a]!)].join('');
    }),
  ) ?? 'QWE';
  const seq = prefix.split('');
  while (seq.length < 18) {
    const level = seq.length + 1;
    const ranks = (k: string) => seq.filter((c) => c === k).length;
    const r = ranks('R');
    if ([6, 11, 16][r] !== undefined && level >= [6, 11, 16][r]!) {
      seq.push('R');
      continue;
    }
    const pick = order.split('').find((k) => ranks(k) < 5 && level >= RANK_LIMIT(ranks(k) + 1));
    if (!pick) return null;
    seq.push(pick);
  }
  return seq as BuildVariant['skillOrder'];
}

function maxOrderOf(seq: string[]): BuildVariant['skillMaxOrder'] {
  const ranks: Record<string, number> = { Q: 0, W: 0, E: 0 };
  const maxed: string[] = [];
  for (const c of seq) if (c in ranks && ++ranks[c]! === 5) maxed.push(c);
  const rest = ['Q', 'W', 'E'].filter((k) => !maxed.includes(k)).sort((a, b) => ranks[b]! - ranks[a]!);
  return [...maxed, ...rest].slice(0, 3) as BuildVariant['skillMaxOrder'];
}

/** A short name for a build from the kind of items it buys. */
export function labelFor(profile: Record<ProfileTag, number>): string {
  const t = (tag: ProfileTag) => profile[tag];
  const tank = (t('Health') + t('Armor') + t('SpellBlock')) / 3;
  // On-hit first: on-hit builds often mix AD and AP items (Kai'Sa, Kog'Maw) but play as one thing.
  if (t('OnHit') >= 0.5 && t('AttackSpeed') >= 0.5 && t('CriticalStrike') < 0.4) return 'On-hit';
  if (t('SpellDamage') >= 0.5) return t('Damage') >= 0.4 ? 'Hybrid' : t('Health') >= 0.4 ? 'AP Bruiser' : 'AP';
  if (t('Damage') >= 0.5) {
    if (t('CriticalStrike') >= 0.4) return 'Crit';
    if (t('Lethality') >= 0.4) return 'Lethality';
    if (t('Health') >= 0.3) return 'Bruiser';
    return 'AD';
  }
  if (tank >= 0.4) return 'Tank';
  if (t('ManaRegen') >= 0.3 || t('AbilityHaste') >= 0.5) return 'Enchanter';
  return 'Utility';
}

/** Swaps are only looked for against these; the rest aren't measured yet. */
const SWAP_TRIGGERS: Trait[] = ['enemy-heavy-healing', 'enemy-tanks-2plus', 'enemy-mostly-ap', 'enemy-mostly-ad', 'enemy-heavy-cc', 'enemy-shields'];
/** Players must buy the item this much more often (absolute share) when the trait is present... */
const SWAP_MIN_LIFT = 0.08;
/** ...in at least this share of those games... */
const SWAP_MIN_RATE = 0.15;
/** ...across at least this many games, and buying it must not lower the win rate. */
const SWAP_MIN_GAMES = 25;
/** Each side of the comparison (trait present / absent) needs this many games. */
const SWAP_MIN_SIDE = 40;
const MAX_SWAPS = 4;
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

/**
 * Items this build's players buy noticeably more against a trait, without losing more for it, and
 * that answer the trait according to Riot's item data.
 * Behavior is the main signal: high-elo players adapt their builds to the enemy team. The win
 * rate check keeps a common habit that loses games from becoming advice.
 */
export function findSwaps(games: BuildGame[], slots: BuildVariant['slots'], items: ItemCatalog): Swap[] {
  const known = games.filter((g) => g.traits);
  const winRate = (gs: BuildGame[]) => gs.filter((g) => g.win).length / gs.length;
  const firstFour = (g: BuildGame) => g.legendaries.slice(0, 4).map((l) => l.id);
  const mainItem = (slot: Slot) => slots.find((s) => s.slot === slot)?.common[0];
  const found: (Swap & { score: number })[] = [];

  for (const trigger of SWAP_TRIGGERS) {
    const on = known.filter((g) => g.traits!.has(trigger));
    const off = known.filter((g) => !g.traits!.has(trigger));
    if (on.length < SWAP_MIN_SIDE || off.length < SWAP_MIN_SIDE) continue;
    const candidates = new Set(on.flatMap(firstFour));
    for (const itemId of candidates) {
      // Only items that actually answer the trigger, so a chance pattern can't become advice.
      if (!items.counters(itemId).has(trigger)) continue;
      const boughtOn = on.filter((g) => firstFour(g).includes(itemId));
      const rateOn = boughtOn.length / on.length;
      const lift = rateOn - off.filter((g) => firstFour(g).includes(itemId)).length / off.length;
      if (lift < SWAP_MIN_LIFT || rateOn < SWAP_MIN_RATE || boughtOn.length < SWAP_MIN_GAMES) continue;
      const notBoughtOn = on.filter((g) => !firstFour(g).includes(itemId));
      if (notBoughtOn.length < SWAP_MIN_GAMES) continue;
      const delta = winRate(boughtOn) - winRate(notBoughtOn);
      if (delta < 0) continue;

      // The slot it usually takes, and what it replaces there.
      const position = mode(boughtOn.map((g) => g.legendaries.findIndex((l) => l.id === itemId)))!;
      const slot = CORE_SLOTS[Math.min(position, CORE_SLOTS.length - 1)]!;
      if (mainItem(slot)?.itemId === itemId) continue;
      const minute = Math.round(boughtOn.reduce((s, g) => s + g.legendaries.find((l) => l.id === itemId)!.minute, 0) / boughtOn.length);

      // The component players pick up first on the way to it.
      const parts = new Set(items.components(itemId));
      const firstPart = mode(
        boughtOn.flatMap((g) => {
          const done = g.legendaries.find((l) => l.id === itemId)!.minute * 60;
          const part = g.buys.find(([id, t]) => t < done && parts.has(id) && items.get(id)!.gold.total >= 700);
          return part ? [part[0]] : [];
        }),
      );

      found.push({
        replacesSlot: slot,
        itemId,
        trigger,
        timing: `Finish it as your ${ORDINAL[position] ?? 'next'} item, around minute ${minute}${firstPart ? `. Start with ${items.name(firstPart)} on an early back` : ''}`,
        earlyComponents: firstPart ? [firstPart] : [],
        evidence: { games: boughtOn.length, winRateDelta: Math.round(delta * 1000) / 1000 },
        score: lift,
      });
    }
  }
  // One swap per item (its strongest trigger), strongest first.
  const best = new Map<number, Swap & { score: number }>();
  for (const s of found.sort((a, b) => b.score - a.score)) if (!best.has(s.itemId)) best.set(s.itemId, s);
  return [...best.values()].slice(0, MAX_SWAPS).map(({ score: _score, ...s }) => s);
}

/** Share of games that finished each item among their first three. */
function coreShares(games: BuildGame[]): Map<number, number> {
  const shares = new Map<number, number>();
  for (const g of games) for (const l of g.legendaries.slice(0, 3)) shares.set(l.id, (shares.get(l.id) ?? 0) + 1 / games.length);
  return shares;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface VariantContext {
  items: ItemCatalog;
  styles: PerkStyle[];
  championName: string;
}

/**
 * 1 to 3 build variants for one champion in one role. Every number comes from the games in that
 * variant's own cluster, so runes, items and skills always come from the same games.
 */
export function buildVariants(games: BuildGame[], ctx: VariantContext): BuildVariant[] {
  const usable = games.filter((g) => g.legendaries.length >= MIN_LEGENDARIES);
  if (usable.length === 0) return [];
  const profiles = usable.map((g) => profileOf(g, ctx.items));
  const labels = chooseClusters(profiles);
  const clusterIds = [...new Set(labels)];

  const variants = clusterIds.map((c) => {
    const members = usable.filter((_, i) => labels[i] === c);
    const memberProfiles = profiles.filter((_, i) => labels[i] === c);
    const centroid = Object.fromEntries(
      PROFILE_TAGS.map((tag, t) => [tag, memberProfiles.reduce((sum, p) => sum + p[t]!, 0) / memberProfiles.length]),
    ) as Record<ProfileTag, number>;

    // Most common full rune page that's valid on this patch.
    const pages = members.flatMap((g) => (g.runes ? [g.runes] : []));
    const byPage = new Map<string, { page: RunePage; n: number }>();
    for (const page of pages) {
      const key = `${page.primaryStyleId}/${page.subStyleId}/${page.perkIds.join(',')}`;
      const entry = byPage.get(key) ?? { page, n: 0 };
      entry.n++;
      byPage.set(key, entry);
    }
    const runes = [...byPage.values()].sort((a, b) => b.n - a.n).find((e) => validateRunePage(e.page, ctx.styles).ok)?.page;
    if (!runes) return null;

    const pair = mode(members.map((g) => [...g.spells].sort((a, b) => a - b) as [number, number]), (s) => s.join(','))!;
    const spells: [number, number] = pair.includes(FLASH) ? [FLASH, pair.find((s) => s !== FLASH) ?? pair[1]] : pair;

    const skillOrder = skillOrderOf(members.map((g) => g.skills));
    if (!skillOrder) return null;
    // Champions like Jayce and Udyr level differently; only standard kits are held to the usual rules.
    const standardKit = skillOrder.includes('R');
    if (standardKit && validateSkillOrder(skillOrder).length > 0) return null;

    const minutes = new Map<number, number[]>();
    for (const g of members) for (const l of g.legendaries) (minutes.get(l.id) ?? minutes.set(l.id, []).get(l.id)!).push(l.minute);

    const slots: BuildVariant['slots'] = [];
    const start = commonSets(members.map((g) => g.start));
    if (start.length) slots.push({ slot: 'start', common: start });
    const firstBack = commonSets(members.filter((g) => g.firstBack.length).map((g) => g.firstBack));
    if (firstBack.length) slots.push({ slot: 'first-back', common: firstBack });
    CORE_SLOTS.forEach((slot, k) => {
      const filled = members.filter((g) => g.legendaries[k]);
      const items = common(filled.map((g) => g.legendaries[k]!.id), filled.length, minutes);
      if (items.length && filled.length >= Math.max(10, members.length * 0.15)) slots.push({ slot, common: items });
    });
    const bootMinutes = new Map<number, number[]>();
    for (const g of members) if (g.boots) (bootMinutes.get(g.boots.id) ?? bootMinutes.set(g.boots.id, []).get(g.boots.id)!).push(g.boots.minute);
    const boots = common(members.map((g) => g.boots?.id), members.length, bootMinutes);
    if (boots.length) slots.push({ slot: 'boots', common: boots });

    const label = labelFor(centroid);
    return {
      id: slug(label),
      label: `${ctx.championName} ${label}`,
      runes,
      spells,
      skillMaxOrder: maxOrderOf(skillOrder),
      skillOrder,
      slots,
      swaps: findSwaps(members, slots, ctx.items),
      stats: {
        games: members.length,
        pickShare: members.length / usable.length,
        winRate: members.filter((g) => g.win).length / members.length,
      },
      coreShares: coreShares(members),
    };
  });

  const built = variants.filter((v): v is NonNullable<typeof v> => v !== null).sort((a, b) => b.stats.games - a.stats.games);
  // Two builds with the same kind of items: name each after the item that most sets it apart,
  // the one it buys far more often than the others do.
  const labelCounts = new Map<string, number>();
  for (const v of built) labelCounts.set(v.id, (labelCounts.get(v.id) ?? 0) + 1);
  return built.map(({ coreShares: shares, ...v }) => {
    if ((labelCounts.get(v.id) ?? 0) < 2) return v;
    const others = built.filter((o) => o.id === v.id && o.coreShares !== shares).map((o) => o.coreShares);
    const signature = [...shares].sort(([a, sa], [b, sb]) => {
      const lead = (id: number, s: number) => s - Math.max(0, ...others.map((o) => o.get(id) ?? 0));
      return lead(b, sb) - lead(a, sa);
    })[0]?.[0];
    if (signature === undefined) return v;
    const itemName = ctx.items.name(signature);
    return { ...v, id: `${v.id}-${slug(itemName)}`, label: `${v.label}: ${itemName}` };
  });
}
