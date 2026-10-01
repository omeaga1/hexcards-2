import { useEffect, useState } from 'react';
import { Badge } from './components/arc/badge/badge';
import { Skeleton } from './components/arc/skeleton/skeleton';
import {
  ROLES, championIconUrl, latestVersion, loadBuildIndex, loadChampions, loadItems, loadRunes,
  type BuildIndex, type ChampionInfo, type ItemInfo, type Role, type RuneData,
} from '@hexcards/data';
import { ChampionBrowser } from './components/ChampionBrowser';
import { settings } from './lcu/settings';
import { ChampionView } from './components/ChampionView';
import { useLeagueClient, type ChampSelectSession } from './lcu/useLeagueClient';
import styles from './App.module.css';

const ROLE_NAMES: Record<string, string> = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };

type GameData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; version: string; items: Map<number, ItemInfo>; champions: Map<number, ChampionInfo> };

/** Published builds: the pipeline's output, served by Vite in development and GitHub Pages in releases. */
const BUILDS_BASE = (import.meta.env.VITE_BUILDS_URL as string | undefined) ?? '/builds';

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
  const [buildIndex, setBuildIndex] = useState<BuildIndex | null>(null);
  const [buildIndexError, setBuildIndexError] = useState<string | null>(null);
  // Read after mount: storage isn't available during the first render in every environment.
  const [recentIds, setRecentIds] = useState<number[]>([]);
  useEffect(() => setRecentIds(settings.recentChampions()), []);
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
    loadBuildIndex(BUILDS_BASE)
      .then((i) => !cancelled && setBuildIndex(i))
      .catch((err: Error) => !cancelled && setBuildIndexError(err.message));
    loadRunes()
      .then((r) => !cancelled && setRunes(r))
      .catch(() => {
        // Rune names and icons are optional; the rest of the page still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const hasBuild = (id: number) => !!buildIndex?.champions[id];
  const pickRole = ROLES.find((r) => r === pick?.role);

  // The most played champion roles this patch, for the browser's highlight row.
  const popular = buildIndex && champions
    ? Object.entries(buildIndex.champions)
        .flatMap(([id, c]) => c.roles.map((r) => ({ id: Number(id), ...r })))
        .sort((x, y) => y.games - x.games)
        .slice(0, 3)
        .flatMap((r) => {
          const champion = champions.get(r.id);
          return champion ? [{ champion, role: ROLE_NAMES[r.role] ?? r.role, variantLabels: r.variants }] : [];
        })
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.wordmark} onClick={() => setSelectedId(null)}>
          Hex Cards
        </button>
        <div className={styles.status}>
          {buildIndex && (
            <Badge tone="neutral" size="sm">
              Patch {buildIndex.patch} · {buildIndex.games.toLocaleString()} games
            </Badge>
          )}
          {buildIndexError && <Badge tone="warning" size="sm">Builds unavailable</Badge>}
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

      {game.status === 'loading' && <Skeleton label="Loading champions" lines={6} />}
      {game.status === 'error' && (
        <p className={styles.error}>Couldn't load champion and item data from Riot. Check your connection and restart. ({game.message})</p>
      )}
      {game.status === 'ready' &&
        (selected ? (
          <ChampionView
            key={selected.id}
            version={game.version}
            items={game.items}
            runes={runes}
            champion={selected}
            source={buildIndex && hasBuild(selected.id) ? { base: BUILDS_BASE, patch: buildIndex.patch } : null}
            preferredRole={selected.id === pickId ? pickRole : undefined}
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
            hasBuild={hasBuild}
            onSelect={setSelectedId}
          />
        ))}
    </div>
  );
}
