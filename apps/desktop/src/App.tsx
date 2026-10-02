import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from './components/arc/badge/badge';
import { Button } from './components/arc/button/button';
import SegmentedControl from './components/arc/segmented-control/segmented-control';
import { Skeleton } from './components/arc/skeleton/skeleton';
import {
  BRACKETS, BRACKET_LABELS, BRACKET_RANKS, ROLES, RoleTable, championIconUrl, latestVersion, loadBuildIndex, loadChampions, loadItems,
  loadLatest, loadPickTable, loadRoleData, loadRunes, loadTraitTable,
  type Bracket, type BuildIndex, type ChampionInfo, type ItemInfo, type Latest, type PickTable, type RuneData,
} from '@hexcards/data';
import { suggestPicks, type TraitTable } from '@hexcards/engine';
import { ChampionBrowser, type RoleFilter } from './components/ChampionBrowser';
import { PickSuggestions } from './components/PickSuggestions';
import { settings } from './lcu/settings';
import { ChampionView } from './components/ChampionView';
import { UpdateBanner } from './components/UpdateBanner';
import { useLeagueClient, type ChampSelectSession } from './lcu/useLeagueClient';
import styles from './App.module.css';

const ROLE_NAMES: Record<string, string> = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };

type GameData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; version: string; items: Map<number, ItemInfo>; champions: Map<number, ChampionInfo> };

/** One rank bracket's published data. */
interface BracketData {
  bracket: Bracket;
  index: BuildIndex;
  roles: RoleTable;
}

/** Published builds: the pipeline's output, served by Vite in development and GitHub Pages in releases. */
const BUILDS_BASE = (import.meta.env.VITE_BUILDS_URL as string | undefined) ?? '/builds';

/** A bracket needs this many games before it's offered; fewer can't produce builds or tiers. */
const MIN_BRACKET_GAMES = 500;

/** Your locked or hovered champion in champ select. */
function myPick(session: ChampSelectSession | null) {
  const me = session?.myTeam.find((p) => p.cellId === session.localPlayerCellId);
  if (!me) return null;
  return { championId: me.championId || me.championPickIntent, role: me.assignedPosition };
}

export function App() {
  const client = useLeagueClient();
  const [game, setGame] = useState<GameData>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [runes, setRunes] = useState<RuneData | null>(null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [bracket, setBracket] = useState<Bracket>('pro');
  // Every bracket's data, loaded up front: switching rank is instant, and pages can compare a
  // champion's tier across ranks.
  const [loaded, setLoaded] = useState<Partial<Record<Bracket, BracketData>>>({});
  const [bracketError, setBracketError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [traitTable, setTraitTable] = useState<TraitTable | null>(null);
  // Lives here rather than in the browser, so it also survives opening a champion and coming back.
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Read after mount: storage isn't available during the first render in every environment.
  const [recentIds, setRecentIds] = useState<number[]>([]);
  useEffect(() => {
    setRecentIds(settings.recentChampions());
    setBracket(settings.bracket());
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    setRecentIds((prev) => {
      const next = [selectedId, ...prev.filter((id) => id !== selectedId)].slice(0, 8);
      settings.setRecentChampions(next);
      return next;
    });
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    latestVersion()
      .then(async (version) => ({ version, items: await loadItems(version), champions: await loadChampions(version) }))
      .then((data) => !cancelled && setGame({ status: 'ready', ...data }))
      .catch((err: Error) => !cancelled && setGame({ status: 'error', message: err.message }));
    loadLatest(BUILDS_BASE)
      .then((l) => {
        if (cancelled) return;
        setLatest(l);
        loadTraitTable(BUILDS_BASE, l.patch)
          .then((t) => !cancelled && setTraitTable(t as TraitTable))
          .catch(() => {
            // Without traits, swaps just don't light up automatically.
          });
      })
      .catch((err: Error) => !cancelled && setLatestError(err.message));
    loadRunes()
      .then((r) => !cancelled && setRunes(r))
      .catch(() => {
        // Rune names and icons are optional; the rest of the page still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = useMemo(
    () => BRACKETS.filter((b) => (latest?.brackets[b] ?? 0) >= MIN_BRACKET_GAMES),
    [latest],
  );
  // Fall back to a bracket that has data if the saved one doesn't yet.
  const activeBracket: Bracket = available.includes(bracket) ? bracket : (available[available.length - 1] ?? bracket);

  // The chosen bracket first, so it shows as soon as it arrives, then the others. Brackets already
  // loaded are kept; only a failed or missing one is fetched again.
  const loadedRef = useRef(loaded);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);
  useEffect(() => {
    if (!latest) return;
    let cancelled = false;
    setBracketError(null);
    const load = async (b: Bracket) => {
      if (loadedRef.current[b]) return;
      const [index, roleData] = await Promise.all([loadBuildIndex(BUILDS_BASE, latest.patch, b), loadRoleData(BUILDS_BASE, latest.patch, b)]);
      if (!cancelled) setLoaded((prev) => ({ ...prev, [b]: { bracket: b, index, roles: new RoleTable(roleData) } }));
    };
    load(activeBracket)
      .catch((err: Error) => !cancelled && setBracketError(err.message))
      // Other brackets only matter once chosen, and choosing one retries it.
      .then(() => Promise.allSettled(available.filter((b) => b !== activeBracket).map(load)));
    return () => {
      cancelled = true;
    };
  }, [latest, available, activeBracket, retry]);

  // What's on screen: the chosen bracket, or the last one shown while it loads, so the browser and
  // champion page stay mounted and keep their filters, role and build choice.
  const [lastShown, setLastShown] = useState<Bracket | null>(null);
  const chosen = loaded[activeBracket];
  useEffect(() => {
    if (chosen) setLastShown(chosen.bracket);
  }, [chosen]);
  const bracketData = chosen ?? (lastShown ? loaded[lastShown] : undefined) ?? null;
  const switching = !!bracketData && bracketData.bracket !== activeBracket && !bracketError;
  const rolesByBracket = useMemo(
    () => available.flatMap((b) => (loaded[b] ? [{ bracket: b, roles: loaded[b].roles }] : [])),
    [available, loaded],
  );

  // In champ select, follow your pick. You can still browse away; a new pick brings you back.
  const pick = myPick(client.session);
  const pickId = pick?.championId || null;
  useEffect(() => {
    if (pickId) setSelectedId(pickId);
  }, [pickId]);

  const champions = game.status === 'ready' ? game.champions : undefined;
  const pickedChampion = pickId ? champions?.get(pickId) : undefined;
  const enemies = (client.session?.theirTeam ?? []).map((p) => champions?.get(p.championId)).filter((c): c is ChampionInfo => !!c);
  const selected = selectedId ? champions?.get(selectedId) : undefined;
  const index = bracketData?.index ?? null;
  const hasBuild = (id: number) => !!index?.champions[id];
  const pickRole = ROLES.find((r) => r === pick?.role);
  const session = client.session;
  const matchup = session && traitTable
    ? {
        allies: session.myTeam.filter((p) => p.cellId !== session.localPlayerCellId).map((p) => p.championId || p.championPickIntent).filter((id) => id > 0),
        enemies: session.theirTeam.map((p) => p.championId).filter((id) => id > 0),
        traits: traitTable,
      }
    : undefined;

  // The most played champion roles in this bracket, for the browser's highlight row.
  const popular = index && champions
    ? Object.entries(index.champions)
        .flatMap(([id, c]) => c.roles.map((r) => ({ id: Number(id), ...r })))
        .sort((x, y) => y.games - x.games)
        .slice(0, 3)
        .flatMap((r) => {
          const champion = champions.get(r.id);
          return champion ? [{ champion, role: ROLE_NAMES[r.role] ?? r.role, variantLabels: r.variants }] : [];
        })
    : [];

  // Pick suggestions: the bracket's pick table is only loaded in champ select (about 60 KB).
  const [pickTable, setPickTable] = useState<{ bracket: Bracket; table: PickTable } | null>(null);
  const shownBracket = bracketData?.bracket;
  useEffect(() => {
    if (!session || !latest || !shownBracket || pickTable?.bracket === shownBracket) return;
    let cancelled = false;
    loadPickTable(BUILDS_BASE, latest.patch, shownBracket)
      .then((table) => !cancelled && setPickTable({ bracket: shownBracket, table }))
      .catch(() => {
        // Builds published before pick tables existed: no suggestions, everything else works.
      });
    return () => {
      cancelled = true;
    };
  }, [!!session, latest, shownBracket]);
  const picks = pickTable && pickTable.bracket === shownBracket ? pickTable.table : undefined;

  const suggestions = useMemo(() => {
    if (!session || !pickRole || !picks || !traitTable || !bracketData || !matchup) return null;
    const others = session.myTeam.filter((p) => p.cellId !== session.localPlayerCellId).map((p) => p.championId || p.championPickIntent);
    const unavailable = new Set([...others, ...matchup.enemies, ...(session.bans?.myTeamBans ?? []), ...(session.bans?.theirTeamBans ?? [])]);
    return suggestPicks({
      role: pickRole, picks, roles: bracketData.roles, traitTable, allies: matchup.allies, enemies: matchup.enemies, unavailable, owned: client.owned,
    });
  }, [session, pickRole, picks, traitTable, bracketData, client.owned]);

  const chooseBracket = (b: Bracket) => {
    setBracket(b);
    settings.setBracket(b);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.wordmark} onClick={() => setSelectedId(null)}>
          Hex Cards
        </button>
        <div className={styles.status}>
          {available.length > 1 && (
            <SegmentedControl
              label="Rank"
              value={activeBracket}
              onValueChange={(v) => chooseBracket(v as Bracket)}
              options={available.map((b) => ({ value: b, label: BRACKET_LABELS[b] }))}
            />
          )}
          {bracketData && index && (
            <Badge tone="neutral" size="sm">
              {BRACKET_RANKS[bracketData.bracket]} · patch {index.patch} · {index.games.toLocaleString()} games
            </Badge>
          )}
          {latestError && <Badge tone="warning" size="sm">Builds unavailable</Badge>}
          <Badge tone={client.connected ? 'success' : client.available ? 'warning' : 'neutral'} size="sm">
            {client.connected ? 'Connected to League' : client.message}
          </Badge>
        </div>
      </header>

      <UpdateBanner />

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
          {game.status === 'ready' && pickRole && suggestions && suggestions.suggestions.length > 0 && (
            <PickSuggestions
              version={game.version}
              champions={game.champions}
              role={pickRole}
              opponent={suggestions.opponent}
              suggestions={suggestions.suggestions}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </section>
      )}

      {(game.status === 'loading' || (!latestError && !bracketData && !bracketError)) && <Skeleton label="Loading champions" lines={6} />}
      {game.status === 'error' && (
        <p className={styles.error}>Couldn't load champion and item data from Riot. Check your connection and restart. ({game.message})</p>
      )}
      {latestError && <p className={styles.error}>Couldn't load builds. Check your connection and restart. ({latestError})</p>}
      {bracketError && (
        <div className={styles.errorRow} role="alert">
          <p className={styles.error}>
            Couldn't load {BRACKET_LABELS[activeBracket]} builds
            {bracketData ? `, so ${BRACKET_LABELS[bracketData.bracket]} is still showing` : ''}. Check your connection and try again. ({bracketError})
          </p>
          <Button variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>Try again</Button>
        </div>
      )}
      {game.status === 'ready' && bracketData && latest && (
        // Dims while the next rank's data loads; what's on screen stays put so filters and scroll survive.
        <div className={styles.content} aria-busy={switching || undefined} data-switching={switching || undefined}>
          {selected ? (
            <ChampionView
              key={selected.id}
              version={game.version}
              items={game.items}
              runes={runes}
              champion={selected}
              source={hasBuild(selected.id) ? { base: BUILDS_BASE, patch: latest.patch, bracket: bracketData.bracket } : null}
              roles={bracketData.roles}
              bracket={bracketData.bracket}
              rolesByBracket={rolesByBracket}
              // In champ select, every champion you look at opens in your role and lights up swaps for these teams,
              // not just the one you're hovering.
              preferredRole={pickRole}
              matchup={matchup}
              picks={picks}
              champions={game.champions}
              connected={client.connected}
              inChampSelect={!!client.session}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <ChampionBrowser
              version={game.version}
              champions={[...game.champions.values()]}
              featured={popular}
              recent={recentIds.flatMap((id) => game.champions.get(id) ?? [])}
              roles={bracketData.roles}
              rolesByBracket={rolesByBracket}
              bracket={bracketData.bracket}
              role={roleFilter}
              onRoleChange={setRoleFilter}
              hasBuild={hasBuild}
              onSelect={setSelectedId}
            />
          )}
        </div>
      )}
    </div>
  );
}
