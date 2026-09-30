import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/registry/components/button/button';
import { RadioCards } from '@/registry/components/radio-cards/radio-cards';
import { Switch } from '@/registry/components/switch/switch';
import {
  TRAIT_LABELS, championIconUrl, loadAbilities,
  type AbilityInfo, type ChampionBuilds, type ChampionInfo, type ItemInfo, type RuneData, type Trait,
} from '@hexcards/data';
import { BuildLane } from './BuildLane';
import { ImportPanel } from './ImportPanel';
import { RunePage } from './RunePage';
import { SkillOrder } from './SkillOrder';
import styles from './ChampionView.module.css';

const SPELL_NAMES: Record<number, string> = { 4: 'Flash', 12: 'Teleport', 14: 'Ignite', 11: 'Smite', 6: 'Ghost', 3: 'Exhaust', 7: 'Heal', 21: 'Barrier', 1: 'Cleanse' };
const ROLE_NAMES: Record<string, string> = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };
const percent = (share: number) => `${Math.round(share * 100)}%`;

interface ChampionViewProps {
  version: string;
  items: Map<number, ItemInfo>;
  /** Null while loading or if CommunityDragon is unreachable. */
  runes: RuneData | null;
  champion: ChampionInfo;
  builds: ChampionBuilds | undefined;
  connected: boolean;
  inChampSelect: boolean;
  onBack: () => void;
}

export function ChampionView({ version, items, runes, champion, builds, connected, inChampSelect, onBack }: ChampionViewProps) {
  const [abilities, setAbilities] = useState<AbilityInfo[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAbilities(version, champion.key)
      .then((a) => !cancelled && setAbilities(a))
      .catch(() => !cancelled && setAbilities(null));
    return () => {
      cancelled = true;
    };
  }, [version, champion.key]);

  return (
    <div className={styles.view}>
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> All champions
        </Button>
      </div>

      <section className={styles.champion}>
        <img className={styles.championIcon} src={championIconUrl(version, champion.key)} alt="" />
        <div>
          <h1 className={styles.title}>{champion.name}</h1>
          {builds && (
            <p className={styles.subtitle}>
              {ROLE_NAMES[builds.role]} · patch {builds.patch}
            </p>
          )}
        </div>
      </section>

      {builds ? (
        <Builds version={version} items={items} runes={runes} abilities={abilities} builds={builds} connected={connected} inChampSelect={inChampSelect} />
      ) : (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>No build for {champion.name} yet</p>
          <p className={styles.note}>
            Builds for every champion come from the data pipeline, which is the next phase. For now only the Jax sample is loaded.
          </p>
        </section>
      )}
    </div>
  );
}

type BuildsProps = Omit<ChampionViewProps, 'champion' | 'onBack' | 'builds'> & { builds: ChampionBuilds; abilities: AbilityInfo[] | null };

function Builds({ version, items, runes, abilities, builds, connected, inChampSelect }: BuildsProps) {
  const [variantId, setVariantId] = useState(builds.variants[0]!.id);
  const [traits, setTraits] = useState<Set<Trait>>(new Set());
  const variant = builds.variants.find((v) => v.id === variantId) ?? builds.variants[0]!;
  const activeSwaps = useMemo(() => variant.swaps.filter((s) => traits.has(s.trigger)), [variant, traits]);
  const triggers = [...new Set(builds.variants.flatMap((v) => v.swaps.map((s) => s.trigger)))];

  const toggleTrait = (trait: Trait, on: boolean) =>
    setTraits((prev) => {
      const next = new Set(prev);
      if (on) next.add(trait);
      else next.delete(trait);
      return next;
    });

  return (
    <>
      <section className={styles.section} aria-labelledby="builds-heading">
        <h2 id="builds-heading" className={styles.sectionTitle}>Builds</h2>
        <RadioCards
          layout="grid"
          minColumnWidth={220}
          value={variantId}
          onValueChange={setVariantId}
          options={builds.variants.map((v) => ({
            value: v.id,
            label: v.label,
            description: `${(v.stats.winRate * 100).toFixed(1)}% win rate · played in ${percent(v.stats.pickShare)} of ${v.stats.games.toLocaleString()} games`,
          }))}
        />
      </section>

      <ImportPanel champion={builds} variant={variant} activeSwaps={activeSwaps} connected={connected} inChampSelect={inChampSelect} />

      <div className={styles.runesAndSkills}>
        <section className={styles.panel} aria-labelledby="runes-heading">
          <div className={styles.sectionHead}>
            <h2 id="runes-heading" className={styles.sectionTitle}>Runes</h2>
            <p className={styles.note}>{variant.spells.map((id) => SPELL_NAMES[id] ?? `Spell ${id}`).join(' and ')}</p>
          </div>
          {runes ? <RunePage page={variant.runes} runes={runes} /> : <p className={styles.note}>Couldn't load rune details.</p>}
        </section>

        <section className={styles.panel} aria-labelledby="skills-heading">
          <h2 id="skills-heading" className={styles.sectionTitle}>Skill order</h2>
          <SkillOrder variant={variant} abilities={abilities} />
        </section>
      </div>

      <section className={styles.section} aria-labelledby="items-heading">
        <div className={styles.sectionHead}>
          <h2 id="items-heading" className={styles.sectionTitle}>Items</h2>
        </div>

        <fieldset className={styles.traits}>
          <legend className={styles.note}>Try the swaps: pretend this game has</legend>
          {triggers.map((trait) => (
            <Switch key={trait} label={TRAIT_LABELS[trait]} checked={traits.has(trait)} onCheckedChange={(on) => toggleTrait(trait, on)} />
          ))}
        </fieldset>

        <BuildLane version={version} variant={variant} items={items} activeSwaps={activeSwaps} />
      </section>
    </>
  );
}
