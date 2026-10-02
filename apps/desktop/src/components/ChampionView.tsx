import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './arc/button/button';
import { Skeleton } from './arc/skeleton/skeleton';
import { Switch } from './arc/switch/switch';
import {
  BRACKET_LABELS, ROLE_LABELS, TRAIT_LABELS, Trait as TraitSchema, championIconUrl, championSplashUrl, loadAbilities, loadChampionBuilds, traitClause,
  type AbilityInfo, type Bracket, type BuildVariant, type ChampionBuilds, type ChampionInfo, type ItemInfo, type PickTable, type Role, type RoleTable,
  type RuneData, type Trait,
} from '@hexcards/data';
import { MIN_EDGE, laneOpponent, matchupTraits, recommendBuild, type BuildRecommendation, type Tier, type TraitTable } from '@hexcards/engine';
import { roleTierList } from '../tiers';
import { BuildDeck } from './BuildDeck';
import { BuildLane } from './BuildLane';
import { ImportPanel } from './ImportPanel';
import { RolePills } from './RolePills';
import { RunePage } from './RunePage';
import { SkillOrder } from './SkillOrder';
import styles from './ChampionView.module.css';

const SPELLS: Record<number, { name: string; key: string }> = {
  4: { name: 'Flash', key: 'SummonerFlash' },
  12: { name: 'Teleport', key: 'SummonerTeleport' },
  14: { name: 'Ignite', key: 'SummonerDot' },
  11: { name: 'Smite', key: 'SummonerSmite' },
  6: { name: 'Ghost', key: 'SummonerHaste' },
  3: { name: 'Exhaust', key: 'SummonerExhaust' },
  7: { name: 'Heal', key: 'SummonerHeal' },
  21: { name: 'Barrier', key: 'SummonerBarrier' },
  1: { name: 'Cleanse', key: 'SummonerBoost' },
};
const spellIconUrl = (version: string, key: string) => `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${key}.png`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** "Crit: The Collector" rather than "Caitlyn Crit: The Collector": the page is already about Caitlyn. */
const buildName = (v: BuildVariant, championName: string) => (v.label.startsWith(`${championName} `) ? v.label.slice(championName.length + 1) : v.label);

/** A trait needs this many games with each build before the note quotes its record. */
const NOTE_MIN_GAMES = 30;

/**
 * Why the recommended build fits this game, in one line: how far ahead it is, and the trait that
 * separates it most from the next best build, with both builds' record in those games.
 */
function recommendationNote(rec: BuildRecommendation, variants: BuildVariant[], championName: string): string {
  const pick = rec.scores.find((s) => s.id === rec.id)!;
  const next = rec.scores.filter((s) => s !== pick).reduce((a, b) => (b.score > a.score ? b : a));
  const variantOf = (id: string) => variants.find((v) => v.id === id)!;
  const [pickName, nextName] = [buildName(variantOf(pick.id), championName), buildName(variantOf(next.id), championName)];
  const mostPlayed = variants.reduce((a, b) => (b.stats.games > a.stats.games ? b : a));

  if (rec.edge < MIN_EDGE && pick.id === mostPlayed.id) return `${pickName} is still the best fit: no other build does clearly better against these teams.`;
  let note = `${pickName} fits this game best, about ${(rec.edge * 100).toFixed(1)} points ahead of ${nextName}.`;

  // Say what actually puts it ahead: these teams, or a better record in every game.
  const fromTeams = pick.score - pick.base - (next.score - next.base);
  const gap = (t: Trait) => (pick.effects.find((e) => e.trait === t)?.delta ?? 0) - (next.effects.find((e) => e.trait === t)?.delta ?? 0);
  const key = pick.effects.map((e) => e.trait).sort((a, b) => gap(b) - gap(a))[0];
  const [pickRecord, nextRecord] = key ? [variantOf(pick.id).traitStats?.[key], variantOf(next.id).traitStats?.[key]] : [];
  if (fromTeams >= 0.005 && key && pickRecord && nextRecord && pickRecord[0] >= NOTE_MIN_GAMES && nextRecord[0] >= NOTE_MIN_GAMES) {
    const clause = traitClause(key).replace(/^./, (c) => c.toUpperCase());
    note += ` ${clause} it won ${pct(pickRecord[1] / pickRecord[0])} of ${pickRecord[0].toLocaleString()} games, against ${pct(nextRecord[1] / nextRecord[0])} of ${nextRecord[0].toLocaleString()}.`;
  } else if (fromTeams < 0.005) {
    note += ` It wins more in general (${pct(variantOf(pick.id).stats.winRate)} against ${pct(variantOf(next.id).stats.winRate)}), and these teams don't change that.`;
  }
  return note;
}

/** Keep the role being viewed if the new builds have it; otherwise your champ select role, then the most played. */
function roleFor(roles: ChampionBuilds[], current: Role | null, preferred: Role | undefined): Role | null {
  if (roles.some((r) => r.role === current)) return current;
  if (roles.some((r) => r.role === preferred)) return preferred!;
  return roles[0]?.role ?? null;
}

interface ChampionViewProps {
  version: string;
  items: Map<number, ItemInfo>;
  /** Null while loading or if CommunityDragon is unreachable. */
  runes: RuneData | null;
  champion: ChampionInfo;
  /** Where published builds live, the patch and rank bracket. Null when this champion has no builds. */
  source: { base: string; patch: string; bracket: Bracket } | null;
  /** Role games, wins and bans in the bracket on screen, for the champion's tier and rates. */
  roles: RoleTable;
  bracket: Bracket;
  /** The same for every loaded bracket, for the champion's tier at each rank. */
  rolesByBracket: { bracket: Bracket; roles: RoleTable }[];
  /** Open this role first if the champion has builds for it (e.g. your champ select position). */
  preferredRole?: Role;
  /** In champ select: the champions on each team, to light up matching swaps and pick a build. */
  matchup?: { allies: number[]; enemies: number[]; traits: TraitTable };
  /** In champ select: the bracket's lane matchups, for this champion's record against your likely lane opponent. */
  picks?: PickTable;
  champions: Map<number, ChampionInfo>;
  connected: boolean;
  inChampSelect: boolean;
  onBack: () => void;
}

type BuildState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; roles: ChampionBuilds[] };

export function ChampionView({
  version, items, runes, champion, source, roles: roleTable, bracket, rolesByBracket, preferredRole, matchup, picks, champions, connected, inChampSelect, onBack,
}: ChampionViewProps) {
  const [abilities, setAbilities] = useState<AbilityInfo[] | null>(null);
  const [builds, setBuilds] = useState<BuildState>({ status: 'loading' });
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    // Switching rank keeps the current builds on screen until the new ones arrive, so the role,
    // build card and swap toggles you picked stay put.
    setBuilds((b) => (b.status === 'ready' ? b : { status: 'loading' }));
    loadChampionBuilds(source.base, source.patch, source.bracket, champion.key)
      .then((loaded) => {
        if (cancelled) return;
        setBuilds({ status: 'ready', roles: loaded });
        setRole((current) => roleFor(loaded, current, preferredRole));
      })
      .catch((err: Error) => !cancelled && setBuilds({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [source?.base, source?.patch, source?.bracket, champion.key]);

  const roles = builds.status === 'ready' ? builds.roles : [];
  // A new champ select position (e.g. after a role swap) opens that role.
  useEffect(() => {
    if (preferredRole && roles.some((r) => r.role === preferredRole)) setRole(preferredRole);
  }, [preferredRole]);
  const current = roles.find((r) => r.role === role);

  // Where this champion stands in the role: tier, win, pick and ban rate in this bracket, and its tier at every rank.
  const standing = useMemo(() => {
    if (!current) return null;
    const tierOf = (table: RoleTable) => {
      const list = roleTierList(table, current.role);
      for (const { tier, entries } of list.tiers) {
        const entry = entries.find((e) => e.championId === champion.id);
        if (entry) return { tier: tier as Tier | undefined, entry };
      }
      const entry = list.lowSample.find((e) => e.championId === champion.id);
      return entry ? { tier: undefined, entry } : null;
    };
    const here = tierOf(roleTable);
    if (!here) return null;
    return {
      ...here,
      byRank: rolesByBracket.map(({ bracket: b, roles: table }) => ({ bracket: b, tier: tierOf(table)?.tier })),
    };
  }, [current?.role, roleTable, rolesByBracket, champion.id]);

  // In champ select: this champion's record against the enemy most likely in its lane.
  const lane = useMemo(() => {
    if (!current || !matchup || !picks) return null;
    const opponent = laneOpponent(current.role, matchup.enemies, roleTable);
    const record = opponent === undefined ? undefined : picks[champion.id]?.[current.role]?.vs[opponent];
    return opponent === undefined ? null : { opponent: champions.get(opponent)?.name ?? 'Lane opponent', record };
  }, [current?.role, matchup?.enemies.join(','), picks, roleTable, champion.id]);
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
        <img className={styles.banner} src={championSplashUrl(champion.key)} alt="" draggable={false} />
        <img className={styles.championIcon} src={championIconUrl(version, champion.key)} alt="" />
        <div className={styles.name}>
          <h1 className={styles.title}>{champion.name}</h1>
          {current && (
            <p className={styles.subtitle}>
              {ROLE_LABELS[current.role]} · patch {current.patch} · {current.variants.reduce((s, v) => s + v.stats.games, 0).toLocaleString()} games
            </p>
          )}
        </div>
        {roles.length > 1 && role && (
          <div className={styles.roleSwitch}>
            <RolePills roles={roles.map((r) => r.role)} value={role} onValueChange={setRole} />
          </div>
        )}
        {standing && current && (
          <dl className={styles.standing} aria-label={`${champion.name} ${ROLE_LABELS[current.role]} in ${BRACKET_LABELS[bracket]}`}>
            <div className={styles.stat}>
              <dt>Tier</dt>
              <dd><span className={styles.tierLetter} data-tier={standing.tier} title={standing.tier ? undefined : 'Too few games to rank'}><span>{standing.tier ?? '?'}</span></span></dd>
            </div>
            <div className={styles.stat}><dt>Win rate</dt><dd>{pct(standing.entry.winRate)}</dd></div>
            <div className={styles.stat}><dt>Pick rate</dt><dd>{pct(standing.entry.pickRate)}</dd></div>
            <div className={styles.stat}><dt>Ban rate</dt><dd>{pct(standing.entry.banRate)}</dd></div>
            {lane && (
              <div className={styles.stat}>
                <dt>vs {lane.opponent} (likely your lane)</dt>
                <dd title={lane.record ? `${lane.record[1]} wins in ${lane.record[0]} games` : undefined}>
                  {lane.record ? `${pct(lane.record[1] / lane.record[0])} of ${lane.record[0].toLocaleString()} games` : 'Not enough games'}
                </dd>
              </div>
            )}
            {standing.byRank.length > 1 && (
              <div className={styles.stat}>
                <dt>Tier by rank</dt>
                <dd className={styles.byRank}>
                  {standing.byRank.map(({ bracket: b, tier }) => (
                    <span key={b} data-current={b === bracket || undefined}>
                      {BRACKET_LABELS[b]} <span className={styles.rankLetter} data-tier={tier}>{tier ?? 'Unranked'}</span>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {!source ? (
        <section className={styles.empty}>
          <p className={styles.emptyTitle}>No build for {champion.name} this patch</p>
          <p className={styles.note}>
            {champion.name} hasn't been played enough at this rank for a reliable build yet. Builds appear once a role has 40 games. Try another rank bracket.
          </p>
        </section>
      ) : builds.status === 'loading' ? (
        <Skeleton label="Loading builds" lines={5} />
      ) : builds.status === 'error' ? (
        <p className={styles.note}>Couldn't load {champion.name}'s builds. ({builds.message})</p>
      ) : current ? (
        <Builds key={current.role} version={version} items={items} runes={runes} abilities={abilities} builds={current} champion={champion} matchup={matchup} connected={connected} inChampSelect={inChampSelect} />
      ) : null}
    </div>
  );
}

type BuildsProps = Omit<ChampionViewProps, 'onBack' | 'source' | 'preferredRole' | 'roles' | 'bracket' | 'rolesByBracket' | 'picks' | 'champions'> & { builds: ChampionBuilds; abilities: AbilityInfo[] | null };

function Builds({ version, items, runes, abilities, builds, champion, matchup, connected, inChampSelect }: BuildsProps) {
  const [variantId, setVariantId] = useState(builds.variants[0]!.id);
  const [traits, setTraits] = useState<Set<Trait>>(new Set());
  // In champ select, the teams decide which swaps light up, and update as picks lock in.
  const allyKey = matchup?.allies.join(',');
  const enemyKey = matchup?.enemies.join(',');
  useEffect(() => {
    if (matchup) setTraits(matchupTraits(matchup.traits, matchup.allies, matchup.enemies));
  }, [allyKey, enemyKey, matchup?.traits]);
  const variant = builds.variants.find((v) => v.id === variantId) ?? builds.variants[0]!;
  const activeSwaps = useMemo(() => variant.swaps.filter((s) => traits.has(s.trigger)), [variant, traits]);

  // Which build fits these teams. In champ select it's picked for you until you pick a card yourself.
  const recommendation = useMemo(() => recommendBuild(builds.variants, traits), [builds.variants, traits]);
  const [pickedByHand, setPickedByHand] = useState(false);
  useEffect(() => {
    if (matchup && recommendation && !pickedByHand) setVariantId(recommendation.id);
  }, [recommendation?.id, !!matchup]);
  const pickCard = (id: string) => {
    setPickedByHand(true);
    setVariantId(id);
  };

  // Toggles for every trait with a swap, and, when there are builds to choose between, every trait
  // the recommendation reads, so any champion can be planned against an AP team or a tank line.
  const recommendable = builds.variants.length > 1 && builds.variants.every((v) => v.traitStats);
  const triggers = TraitSchema.options.filter(
    (t) => builds.variants.some((v) => v.swaps.some((s) => s.trigger === t)) || (recommendable && builds.variants.some((v) => v.traitStats?.[t])),
  );

  const toggleTrait = (trait: Trait, on: boolean) =>
    setTraits((prev) => {
      const next = new Set(prev);
      if (on) next.add(trait);
      else next.delete(trait);
      return next;
    });

  return (
    <>
      <div className={styles.hand}>
        <section className={styles.section} aria-labelledby="builds-heading">
          <div className={styles.sectionHead}>
            <h2 id="builds-heading" className={styles.sectionTitle}>Builds</h2>
            {builds.variants.length > 1 && !recommendation && <p className={styles.note}>{builds.variants.length} ways to play {champion.name}. Pick a card.</p>}
          </div>
          {recommendation && <p className={styles.recommendation} aria-live="polite">{recommendationNote(recommendation, builds.variants, champion.name)}</p>}
          <BuildDeck
            version={version}
            champion={champion}
            variants={builds.variants}
            items={items}
            value={variant.id}
            recommendedId={recommendation?.id}
            onValueChange={pickCard}
          />
        </section>

        <ImportPanel champion={builds} variant={variant} activeSwaps={activeSwaps} connected={connected} inChampSelect={inChampSelect} />
      </div>

      <div className={styles.runesAndSkills}>
        <section className={styles.panel} aria-labelledby="runes-heading">
          <div className={styles.sectionHead}>
            <h2 id="runes-heading" className={styles.sectionTitle}>Runes</h2>
            <p className={styles.spells}>
              {variant.spells.map((id) => (
                <span key={id} className={styles.spell}>
                  {SPELLS[id] && <img src={spellIconUrl(version, SPELLS[id].key)} alt="" draggable={false} />}
                  {SPELLS[id]?.name ?? `Spell ${id}`}
                </span>
              ))}
            </p>
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
          <legend className={styles.note}>{matchup ? 'From this champ select' : 'Pretend this game has'}</legend>
          {triggers.map((trait) => (
            <Switch key={trait} label={TRAIT_LABELS[trait]} checked={traits.has(trait)} onCheckedChange={(on) => toggleTrait(trait, on)} />
          ))}
        </fieldset>}

        <BuildLane version={version} variant={variant} items={items} activeSwaps={activeSwaps} />
      </section>
    </>
  );
}
