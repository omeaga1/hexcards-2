// What kind of purchase an item is, from Riot's Data Dragon item data.

export interface DDragonItem {
  name: string;
  description?: string;
  gold: { total: number; purchasable: boolean };
  tags?: string[];
  into?: string[];
  from?: string[];
  depth?: number;
  maps?: Record<string, boolean>;
}

/**
 * Tags that describe what a finished item is for. These make up each build's profile.
 * "Lethality" isn't a Riot tag: Riot tags Black Cleaver and Lord Dominik's "ArmorPenetration" too,
 * so lethality items are found by their description instead.
 */
export const PROFILE_TAGS = [
  'Damage', 'SpellDamage', 'AttackSpeed', 'CriticalStrike', 'OnHit', 'Lethality', 'ArmorPenetration', 'MagicPenetration',
  'Health', 'Armor', 'SpellBlock', 'AbilityHaste', 'Mana', 'ManaRegen', 'LifeSteal',
] as const;
export type ProfileTag = (typeof PROFILE_TAGS)[number];

/** Finished items cost at least this much; cheaper items with nothing to build into are components or consumables. */
const LEGENDARY_GOLD = 2000;

export class ItemCatalog {
  constructor(private readonly items: Record<string, DDragonItem>) {}

  get(id: number): DDragonItem | undefined {
    return this.items[id];
  }

  name(id: number): string {
    return this.items[id]?.name ?? `Item ${id}`;
  }

  /** A finished item that counts toward the core build. Boots are tracked separately. */
  isLegendary(id: number): boolean {
    const item = this.items[id];
    if (!item || item.tags?.includes('Boots') || item.tags?.includes('Consumable') || item.tags?.includes('Trinket')) return false;
    return item.gold.total >= LEGENDARY_GOLD && (item.into ?? []).length === 0;
  }

  /** Upgraded boots (Plated Steelcaps, Berserker's Greaves, ...), not the 300 gold base boots. */
  isBoots(id: number): boolean {
    const item = this.items[id];
    return !!item?.tags?.includes('Boots') && (item.depth ?? 1) >= 2;
  }

  /** Free trinkets (Stealth Ward, Oracle Lens, Farsight Alteration). */
  isTrinket(id: number): boolean {
    return !!this.items[id]?.tags?.includes('Trinket');
  }

  /** Something you buy to build toward an item (not consumables, wards or trinkets). */
  isComponent(id: number): boolean {
    const item = this.items[id];
    if (!item || item.tags?.some((t) => t === 'Consumable' || t === 'Trinket')) return false;
    return (item.into ?? []).length > 0;
  }

  /** Items this one is built from, recursively. */
  components(id: number): number[] {
    const from = (this.items[id]?.from ?? []).map(Number);
    return [...from, ...from.flatMap((c) => this.components(c))];
  }

  profile(id: number): Record<ProfileTag, number> {
    const item = this.items[id];
    const tags = new Set(item?.tags ?? []);
    if (/Lethality/.test(item?.description ?? '')) tags.add('Lethality');
    return Object.fromEntries(PROFILE_TAGS.map((t) => [t, tags.has(t) ? 1 : 0])) as Record<ProfileTag, number>;
  }
}
