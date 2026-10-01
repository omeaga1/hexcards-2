import { useEffect, useState } from 'react';
import { Badge } from './components/arc/badge/badge';
import { Skeleton } from './components/arc/skeleton/skeleton';
import {
  championIconUrl, latestVersion, loadChampions, loadItems, loadRunes, sampleBuilds,
  type ChampionInfo, type ItemInfo, type RuneData,
} from '@hexcards/data';
import { ChampionBrowser } from './components/ChampionBrowser';
import { ChampionView } from './components/ChampionView';
import { useLeagueClient, type ChampSelectSession } from './lcu/useLeagueClient';
import styles from './App.module.css';

const ROLE_NAMES: Record<string, string> = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };

type GameData =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; version: string; items: Map<number, ItemInfo>; champions: Map<number, ChampionInfo> };

// Only sample builds exist until the data pipeline ships (phase 2).
const buildsFor = (championId: number) => sampleBuilds.find((b) => b.championId === championId);

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

  useEffect(() => {
    let cancelled = false;
    latestVersion()
      .then(async (version) => ({ version, items: await loadItems(version), champions: await loadChampions(version) }))
      .then((data) => !cancelled && setGame({ status: 'ready', ...data }))
      .catch((err: Error) => !cancelled && setGame({ status: 'error', message: err.message }));
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.wordmark} onClick={() => setSelectedId(null)}>
          Hex Cards
        </button>
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
            builds={buildsFor(selected.id)}
            connected={client.connected}
            inChampSelect={!!client.session}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <ChampionBrowser
            version={game.version}
            champions={[...game.champions.values()]}
            hasBuild={(id) => !!buildsFor(id)}
            onSelect={setSelectedId}
          />
        ))}
    </div>
  );
}
