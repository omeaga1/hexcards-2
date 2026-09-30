import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/registry/components/badge/badge';
import { RadioCards } from '@/registry/components/radio-cards/radio-cards';
import { Skeleton } from '@/registry/components/skeleton/skeleton';
import { Switch } from '@/registry/components/switch/switch';
import { TRAIT_LABELS, championIconUrl, latestVersion, loadItems, sampleJaxTop, type ItemInfo, type Trait } from '@hexcards/data';
import { BuildLane } from './components/BuildLane';
import styles from './App.module.css';

const SPELL_NAMES: Record<number, string> = { 4: 'Flash', 12: 'Teleport', 14: 'Ignite', 11: 'Smite', 6: 'Ghost', 3: 'Exhaust', 7: 'Heal', 21: 'Barrier', 1: 'Cleanse' };
const ROLE_NAMES = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' } as const;
const percent = (share: number) => `${Math.round(share * 100)}%`;

type ItemData = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; version: string; items: Map<number, ItemInfo> };

export function App() {
  const champion = sampleJaxTop;
  const [variantId, setVariantId] = useState(champion.variants[0]!.id);
  const [traits, setTraits] = useState<Set<Trait>>(new Set());
  const [itemData, setItemData] = useState<ItemData>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    latestVersion()
      .then(async (version) => ({ version, items: await loadItems(version) }))
      .then(({ version, items }) => !cancelled && setItemData({ status: 'ready', version, items }))
      .catch((err: Error) => !cancelled && setItemData({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  const variant = champion.variants.find((v) => v.id === variantId) ?? champion.variants[0]!;
  const activeSwaps = useMemo(() => variant.swaps.filter((s) => traits.has(s.trigger)), [variant, traits]);
  const triggers = [...new Set(champion.variants.flatMap((v) => v.swaps.map((s) => s.trigger)))];

  const toggleTrait = (trait: Trait, on: boolean) =>
    setTraits((prev) => {
      const next = new Set(prev);
      if (on) next.add(trait);
      else next.delete(trait);
      return next;
    });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.wordmark}>Hex Cards</span>
        <div className={styles.status}>
          <Badge tone="neutral" size="sm">Sample data</Badge>
          <Badge tone="warning" size="sm">League client not connected</Badge>
        </div>
      </header>

      <section className={styles.champion}>
        {itemData.status === 'ready' && (
          <img className={styles.championIcon} src={championIconUrl(itemData.version, champion.championKey)} alt="" />
        )}
        <div>
          <h1 className={styles.title}>{champion.championKey}</h1>
          <p className={styles.subtitle}>
            {ROLE_NAMES[champion.role]} · patch {champion.patch}
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="builds-heading">
        <h2 id="builds-heading" className={styles.sectionTitle}>Builds</h2>
        <RadioCards
          layout="grid"
          minColumnWidth={220}
          value={variantId}
          onValueChange={setVariantId}
          options={champion.variants.map((v) => ({
            value: v.id,
            label: v.label,
            description: `${(v.stats.winRate * 100).toFixed(1)}% win rate · played in ${percent(v.stats.pickShare)} of ${v.stats.games.toLocaleString()} games`,
          }))}
        />
      </section>

      <section className={styles.section} aria-labelledby="items-heading">
        <div className={styles.sectionHead}>
          <h2 id="items-heading" className={styles.sectionTitle}>Items</h2>
          <p className={styles.note}>
            Max {variant.skillMaxOrder.join(', then ')} · {variant.spells.map((id) => SPELL_NAMES[id] ?? `Spell ${id}`).join(' and ')}
          </p>
        </div>

        <fieldset className={styles.traits}>
          <legend className={styles.note}>Try the swaps: pretend this game has</legend>
          {triggers.map((trait) => (
            <Switch key={trait} label={TRAIT_LABELS[trait]} checked={traits.has(trait)} onCheckedChange={(on) => toggleTrait(trait, on)} />
          ))}
        </fieldset>

        {itemData.status === 'loading' && <Skeleton label="Loading items" lines={4} />}
        {itemData.status === 'error' && (
          <p className={styles.error}>Couldn't load item data from Riot. Check your connection and restart. ({itemData.message})</p>
        )}
        {itemData.status === 'ready' && (
          <BuildLane version={itemData.version} variant={variant} items={itemData.items} activeSwaps={activeSwaps} />
        )}
      </section>
    </div>
  );
}
