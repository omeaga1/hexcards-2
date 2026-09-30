import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/registry/components/badge/badge';
import { RadioCards } from '@/registry/components/radio-cards/radio-cards';
import { Skeleton } from '@/registry/components/skeleton/skeleton';
import { Switch } from '@/registry/components/switch/switch';
import {
  TRAIT_LABELS, championIconUrl, latestVersion, loadChampions, loadItems, sampleJaxTop,
  type ChampionInfo, type ItemInfo, type Trait,
} from '@hexcards/data';
import { BuildLane } from './components/BuildLane';
import { ImportPanel } from './components/ImportPanel';
import { useLeagueClient, type ChampSelectSession } from './lcu/useLeagueClient';
import styles from './App.module.css';

const SPELL_NAMES: Record<number, string> = { 4: 'Flash', 12: 'Teleport', 14: 'Ignite', 11: 'Smite', 6: 'Ghost', 3: 'Exhaust', 7: 'Heal', 21: 'Barrier', 1: 'Cleanse' };
const ROLE_NAMES: Record<string, string> = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };
const percent = (share: number) => `${Math.round(share * 100)}%`;

type GameData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; version: string; items: Map<number, ItemInfo>; champions: Map<number, ChampionInfo> };

/** Your locked or hovered champion in champ select. */
function myPick(session: ChampSelectSession | null) {
  const me = session?.myTeam.find((p) => p.cellId === session.localPlayerCellId);
  if (!me) return null;
  return { championId: me.championId || me.championPickIntent, role: me.assignedPosition };
}

export function App() {
  const client = useLeagueClient();
  const [game, setGame] = useState<GameData>({ status: 'loading' });
  const [traits, setTraits] = useState<Set<Trait>>(new Set());

  useEffect(() => {
    let cancelled = false;
    latestVersion()
      .then(async (version) => ({ version, items: await loadItems(version), champions: await loadChampions(version) }))
      .then((data) => !cancelled && setGame({ status: 'ready', ...data }))
      .catch((err: Error) => !cancelled && setGame({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = myPick(client.session);
  const champions = game.status === 'ready' ? game.champions : undefined;
  const pickedChampion = pick?.championId ? champions?.get(pick.championId) : undefined;
  const enemies = (client.session?.theirTeam ?? []).map((p) => champions?.get(p.championId)).filter((c): c is ChampionInfo => !!c);

  // Only the sample build exists until the data pipeline ships (phase 2).
  const champion = sampleJaxTop;
  const hasBuild = !pickedChampion || pickedChampion.id === champion.championId;

  const [variantId, setVariantId] = useState(champion.variants[0]!.id);
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
          <Badge tone={client.connected ? 'success' : client.available ? 'warning' : 'neutral'} size="sm">
            {client.connected ? 'Connected to League' : client.message}
          </Badge>
        </div>
      </header>

      {client.session && (
        <section className={styles.champSelect} aria-label="Champ select">
          <div>
            <p className={styles.note}>Champ select</p>
            <p className={styles.pick}>
              {pickedChampion ? `You're on ${pickedChampion.name}` : 'Pick a champion'}
              {pick?.role ? ` · ${ROLE_NAMES[pick.role] ?? pick.role}` : ''}
            </p>
          </div>
          {game.status === 'ready' && enemies.length > 0 && (
            <div className={styles.enemies}>
              <span className={styles.note}>Enemy team</span>
              {enemies.map((c) => (
                <img key={c.id} className={styles.enemyIcon} src={championIconUrl(game.version, c.key)} alt={c.name} title={c.name} />
              ))}
            </div>
          )}
        </section>
      )}

      {!hasBuild && pickedChampion ? (
        <section className={styles.section}>
          <h1 className={styles.title}>{pickedChampion.name}</h1>
          <p className={styles.note}>
            No build for {pickedChampion.name} yet. Real builds for every champion arrive with the data pipeline. Only the Jax sample is loaded for now.
          </p>
        </section>
      ) : (
        <>
          <section className={styles.champion}>
            {game.status === 'ready' && (
              <img className={styles.championIcon} src={championIconUrl(game.version, champion.championKey)} alt="" />
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

          <ImportPanel
            champion={champion}
            variant={variant}
            activeSwaps={activeSwaps}
            connected={client.connected}
            inChampSelect={!!client.session}
          />

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

            {game.status === 'loading' && <Skeleton label="Loading items" lines={4} />}
            {game.status === 'error' && (
              <p className={styles.error}>Couldn't load item data from Riot. Check your connection and restart. ({game.message})</p>
            )}
            {game.status === 'ready' && (
              <BuildLane version={game.version} variant={variant} items={game.items} activeSwaps={activeSwaps} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
