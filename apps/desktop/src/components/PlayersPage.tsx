import { useEffect, useRef, useState } from 'react';
import { MonitorSmartphone, Users } from 'lucide-react';
import { profileIconUrl, type ChampionInfo, type ItemInfo, type LcuSummoner, type RuneData } from '@hexcards/data';
import { parseRiotId, type LcuClient } from '@hexcards/engine';
import { Button } from './arc/button/button';
import { EmptyState } from './arc/empty-state/empty-state';
import { SearchField } from './arc/search-field/search-field';
import { PlayerProfile } from './PlayerProfile';
import { currentPlayer, findPlayer, toRef, type PlayerRef } from '../lcu/players';
import { settings } from '../lcu/settings';
import styles from './PlayersPage.module.css';

const MAX_RECENT = 6;

interface PlayersPageProps {
  /** Null when there's no League client to ask: a plain browser, or League isn't running. */
  client: LcuClient | null;
  /** True in the desktop app, even before League is running. */
  desktop: boolean;
  version: string;
  champions: Map<number, ChampionInfo>;
  items: Map<number, ItemInfo>;
  runes: RuneData | null;
  onOpenChampion: (championId: number) => void;
}

type Search = { status: 'idle' } | { status: 'searching' } | { status: 'error'; message: string };

const riotId = (p: { gameName: string; tagLine: string }) => `${p.gameName}#${p.tagLine}`;

function PlayerRow({ player, version, active, onSelect, note }: { player: PlayerRef; version: string; active: boolean; onSelect: () => void; note?: string }) {
  return (
    <button type="button" className={styles.playerRow} aria-current={active || undefined} onClick={onSelect}>
      <img src={profileIconUrl(version, player.profileIconId)} alt="" draggable={false} />
      <span className={styles.playerText}>
        <span className={styles.playerName}>{player.gameName}</span>
        <span className={styles.playerTag}>{note ?? `#${player.tagLine}`}</span>
      </span>
    </button>
  );
}

export function PlayersPage({ client, desktop, version, champions, items, runes, onOpenChampion }: PlayersPageProps) {
  const [me, setMe] = useState<LcuSummoner | null>(null);
  const [selected, setSelected] = useState<PlayerRef | null>(null);
  const [pinned, setPinned] = useState<PlayerRef[]>([]);
  const [recent, setRecent] = useState<PlayerRef[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ status: 'idle' });
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPinned(settings.pinnedPlayers());
    setRecent(settings.recentPlayers());
  }, []);

  // You, from the signed-in account: shown first, no typing needed.
  useEffect(() => {
    if (!client) {
      setMe(null);
      return;
    }
    let cancelled = false;
    currentPlayer(client)
      .then((s) => {
        if (cancelled) return;
        setMe(s);
        setSelected((current) => current ?? toRef(s));
      })
      .catch(() => {
        // Signed out or still loading: searching still works.
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const open = (player: PlayerRef) => {
    setSelected(player);
    contentRef.current?.scrollIntoView?.({ block: 'start' });
    if (me && player.puuid === me.puuid) return;
    setRecent((prev) => {
      const next = [player, ...prev.filter((p) => p.puuid !== player.puuid)].slice(0, MAX_RECENT);
      settings.setRecentPlayers(next);
      return next;
    });
  };

  // Keep saved names and icons current: Riot IDs and icons can change.
  const refreshSaved = (s: LcuSummoner) => {
    const update = (list: PlayerRef[]) => (list.some((p) => p.puuid === s.puuid) ? list.map((p) => (p.puuid === s.puuid ? toRef(s) : p)) : list);
    setPinned((prev) => {
      const next = update(prev);
      if (next !== prev) settings.setPinnedPlayers(next);
      return next;
    });
    setRecent((prev) => {
      const next = update(prev);
      if (next !== prev) settings.setRecentPlayers(next);
      return next;
    });
  };

  const togglePin = (player: PlayerRef) => {
    setPinned((prev) => {
      const next = prev.some((p) => p.puuid === player.puuid) ? prev.filter((p) => p.puuid !== player.puuid) : [...prev, player];
      settings.setPinnedPlayers(next);
      return next;
    });
  };

  const submit = async () => {
    if (!client) return;
    const id = parseRiotId(query);
    if (!id) {
      setSearch({ status: 'error', message: 'Type a Riot ID with its tag, like Name#NA1.' });
      return;
    }
    setSearch({ status: 'searching' });
    try {
      const found = await findPlayer(client, id.gameName, id.tagLine);
      if (!found) {
        setSearch({ status: 'error', message: `No player called ${id.gameName}#${id.tagLine} on your server. Check the spelling and tag.` });
        return;
      }
      setSearch({ status: 'idle' });
      setQuery('');
      open(toRef(found));
    } catch (err) {
      setSearch({ status: 'error', message: `${(err as Error).message} Check that League is still open.` });
    }
  };

  // Ctrl+K or "/" jumps to the search, as on the champions page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!client) {
    return (
      <div className={styles.waiting}>
        <EmptyState
          icon={desktop ? <Users size={24} /> : <MonitorSmartphone size={24} />}
          title={desktop ? 'Open League to look up players' : 'Player stats need the desktop app'}
          description={
            desktop
              ? 'Stats come from your League client\'s match history, the same games your profile shows. Builds and tier lists work without it.'
              : 'Stats are read from the League client on your computer. Open Hex Cards for Windows with League running to see them.'
          }
        />
      </div>
    );
  }

  const isPinned = (p: PlayerRef) => pinned.some((x) => x.puuid === p.puuid);
  const others = recent.filter((p) => !isPinned(p) && p.puuid !== me?.puuid);

  return (
    <div className={styles.layout}>
      <aside className={styles.rail}>
        <form
          className={styles.search}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <SearchField
            ref={searchRef}
            label="Find a player"
            placeholder="Name#TAG"
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              if (search.status === 'error') setSearch({ status: 'idle' });
            }}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="player-search-hint"
          />
          <Button type="submit" variant="secondary" size="sm" loading={search.status === 'searching'} disabled={!query.trim()}>
            Look up player
          </Button>
          <p id="player-search-hint" className={styles.hint} data-error={search.status === 'error' || undefined} role={search.status === 'error' ? 'alert' : undefined}>
            {search.status === 'error' ? search.message : 'Riot ID and tag of anyone on your League server.'}
          </p>
        </form>

        {me && (
          <div className={styles.group}>
            <span className={styles.railTitle}>You</span>
            <PlayerRow player={toRef(me)} version={version} active={selected?.puuid === me.puuid} onSelect={() => open(toRef(me))} note={`#${me.tagLine} · level ${me.summonerLevel}`} />
          </div>
        )}

        <div className={styles.group}>
          <span className={styles.railTitle}>Pinned</span>
          {pinned.length === 0 ? (
            <p className={styles.caption}>Pin friends and rivals from their profile to keep them here.</p>
          ) : (
            pinned.map((p) => <PlayerRow key={p.puuid} player={p} version={version} active={selected?.puuid === p.puuid} onSelect={() => open(p)} />)
          )}
        </div>

        {others.length > 0 && (
          <div className={styles.group}>
            <span className={styles.railTitle}>Recently looked up</span>
            {others.map((p) => <PlayerRow key={p.puuid} player={p} version={version} active={selected?.puuid === p.puuid} onSelect={() => open(p)} />)}
          </div>
        )}

        <p className={styles.caption}>
          Stats come from the League client's match history: Summoner's Rift games only, the same ones a profile shows in the client.
        </p>
      </aside>

      <div className={styles.content} ref={contentRef}>
        {selected ? (
          <PlayerProfile
            key={selected.puuid}
            client={client}
            player={selected}
            isYou={selected.puuid === me?.puuid}
            pinned={isPinned(selected)}
            onTogglePin={togglePin}
            onResolved={refreshSaved}
            onOpenPlayer={open}
            onOpenChampion={onOpenChampion}
            version={version}
            champions={champions}
            items={items}
            runes={runes}
          />
        ) : (
          <EmptyState
            icon={<Users size={24} />}
            title="Look up a player"
            description="Search a Riot ID to see their rank, recent form, best champions and match history."
            action={<Button variant="secondary" onClick={() => searchRef.current?.focus()}>Search players</Button>}
          />
        )}
      </div>
    </div>
  );
}
