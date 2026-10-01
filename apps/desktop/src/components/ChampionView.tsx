import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './arc/button/button';
import { RadioCards } from './arc/radio-cards/radio-cards';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Skeleton } from './arc/skeleton/skeleton';
import { Switch } from './arc/switch/switch';
import {
  ROLE_LABELS, TRAIT_LABELS, championIconUrl, loadAbilities, loadChampionBuilds,
  type AbilityInfo, type ChampionBuilds, type ChampionInfo, type ItemInfo, type Role, type RuneData, type Trait,
} from '@hexcards/data';
import { BuildLane } from './BuildLane';
import { ImportPanel } from './ImportPanel';
import { RunePage } from './RunePage';
import { SkillOrder } from './SkillOrder';
import styles from './ChampionView.module.css';

const SPELL_NAMES: Record<number, string> = { 4: 'Flash', 12: 'Teleport', 14: 'Ignite', 11: 'Smite', 6: 'Ghost', 3: 'Exhaust', 7: 'Heal', 21: 'Barrier', 1: 'Cleanse' };
const percent = (share: number) => `${Math.round(share * 100)}%`;

interface ChampionViewProps {
  version: string;
  items: Map<number, ItemInfo>;
  /** Null while loading or if CommunityDragon is unreachable. */
  runes: RuneData | null;
  champion: ChampionInfo;
  /** Where published builds live, and the current patch. Null when this champion has no builds. */
  source: { base: string; patch: string } | null;
  /** Open this role first if the champion has builds for it (e.g. your champ select position). */
  preferredRole?: Role;
  connected: boolean;
  inChampSelect: boolean;
  onBack: () => void;
}

type BuildState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; roles: ChampionBuilds[] };

export function ChampionView({ version, items, runes, champion, source, preferredRole, connected, inChampSelect, onBack }: ChampionViewProps) {
  const [abilities, setAbilities] = useState<AbilityInfo[] | null>(null);
  const [builds, setBuilds] = useState<BuildState>({ status: 'loading' });
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setBuilds({ status: 'loading' });
    loadChampionBuilds(source.base, source.patch, champion.key)
      .then((roles) => {
        if (cancelled) return;
        setBuilds({ status: 'ready', roles });
        setRole(roles.some((r) => r.role === preferredRole) ? preferredRole! : (roles[0]?.role ?? null));
      })
      .catch((err: Error) => !cancelled && setBuilds({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [source?.base, source?.patch, champion.key, preferredRole]);

  const roles = builds.status === 'ready' ? builds.roles : [];
  const current = roles.find((r) => r.role === role);
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
          {current && (
            <p className={styles.subtitle}>
              {ROLE_LABELS[current.role]} · patch {current.patch} · {current.variants.reduce((s, v) => s + v.stats.games, 0).toLocaleString()} high-elo games
            </p>
          )}
        </div>
        {roles.length > 1 && role && (
          <SegmentedControl
            className={styles.roleSwitch}
            label="Role"
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            options={roles.map((r) => ({ value: r.role, label: ROLE_LABELS[r.role] }))}
          />
        )}
      </section>

      {!source ? (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>No build for {champion.name} this patch</p>
          <p className={styles.note}>
            {champion.name} wasn't played enough in Master and above for a reliable build yet. Builds appear once a role has 40 games.
          </p>
        </section>
      ) : builds.status === 'loading' ? (
        <Skeleton label="Loading builds" lines={5} />
      ) : builds.status === 'error' ? (
        <p className={styles.note}>Couldn't load {champion.name}'s builds. ({builds.message})</p>
      ) : current ? (
        <Builds key={current.role} version={version} items={items} runes={runes} abilities={abilities} builds={current} connected={connected} inChampSelect={inChampSelect} />
      ) : null}
    </div>
  );
}

type BuildsProps = Omit<ChampionViewProps, 'champion' | 'onBack' | 'source' | 'preferredRole'> & { builds: ChampionBuilds; abilities: AbilityInfo[] | null };

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

        {triggers.length > 0 && <fieldset className={styles.traits}>
          <legend className={styles.note}>Try the swaps: pretend this game has</legend>
          {triggers.map((trait) => (
            <Switch key={trait} label={TRAIT_LABELS[trait]} checked={traits.has(trait)} onCheckedChange={(on) => toggleTrait(trait, on)} />
          ))}
        </fieldset>}

        <BuildLane version={version} variant={variant} items={items} activeSwaps={activeSwaps} />
      </section>
    </>
  );
}
