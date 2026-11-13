import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorSmartphone, Users } from 'lucide-react';
import { OPGG_REGIONS, REGION_LABELS, profileIconUrl, type ChampionInfo, type ItemInfo, type Region, type RuneData } from '@hexcards/data';
import { parseRiotId, type LcuClient } from '@hexcards/engine';
import { Button } from './arc/button/button';
import { EmptyState } from './arc/empty-state/empty-state';
import { SearchField } from './arc/search-field/search-field';
import { Select } from './arc/select/select';
import { PlayerProfile } from './PlayerProfile';
import {
  clientRegion, clientSource, currentPlayer, opggSource, playerKey, toRef, type OpggCall, type PlayerRef, type PlayerSource,
} from '../lcu/players';
import { settings } from '../lcu/settings';
import styles from './PlayersPage.module.css';

const MAX_RECENT = 6;

const REGION_OPTIONS = OPGG_REGIONS.map((r) => ({ value: r, label: `${r} · ${REGION_LABELS[r]}` }));

interface PlayersPageProps {
  /** The League client when it's running (the freshest data for your server), else null. */
  client: LcuClient | null;
  /** OP.GG lookups: any region, League closed. Null only in a plain browser build. */
  opgg: OpggCall | null;
  version: string;
  champions: Map<number, ChampionInfo>;
  items: Map<number, ItemInfo>;
  runes: RuneData | null;
  onOpenChampion: (championId: number) => void;
}

type Search = { status: 'idle' } | { status: 'searching' } | { status: 'error'; message: string };

/** The client's server, once asked: undefined while asking, null when unknown. */
type ClientInfo = { region: Region | null } | undefined;

const same = (a: PlayerRef | null | undefined, b: PlayerRef | null | undefined) => !!a && !!b && (a.puuid === b.puuid || playerKey(a) === playerKey(b));

function PlayerRow({ player, version, active, onSelect, note }: { player: PlayerRef; version: string; active: boolean; onSelect: () => void; note?: string }) {
  return (
    <button type="button" className={styles.playerRow} aria-current={active || undefined} onClick={onSelect}>
      <img src={profileIconUrl(version, player.profileIconId)} alt="" draggable={false} />
      <span className={styles.playerText}>
        <span className={styles.playerName}>{player.gameName}</span>
        <span className={styles.playerTag}>{note ?? `#${player.tagLine} · ${player.region}`}</span>
      </span>
    </button>
  );
}

export function PlayersPage({ client, opgg, version, champions, items, runes, onOpenChampion }: PlayersPageProps) {
  const [me, setMe] = useState<PlayerRef | null>(() => settings.me());
  const [selected, setSelected] = useState<PlayerRef | null>(() => settings.me());
  const [pinned, setPinned] = useState<PlayerRef[]>(() => settings.pinnedPlayers());
  const [recent, setRecent] = useState<PlayerRef[]>(() => settings.recentPlayers());
  const [region, setRegion] = useState<Region>(() => settings.region() ?? 'NA');
  const [clientInfo, setClientInfo] = useState<ClientInfo>(undefined);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ status: 'idle' });
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // The League client, when it's open, is the source for players on its server; OP.GG for the rest.
  const live = useMemo(() => (client ? clientSource(client) : null), [client]);
  const opggSources = useRef(new Map<Region, PlayerSource>());
  const sourceFor = (r: Region): PlayerSource | null => {
    if (live && clientInfo?.region === r) return live;
    if (!opgg) return null;
    let s = opggSources.current.get(r);
    if (!s) {
      s = opggSource(opgg, r);
      opggSources.current.set(r, s);
    }
    return s;
  };

  // With League open: its server becomes the default region, and the signed-in account is you.
  useEffect(() => {
    if (!client) {
      setClientInfo({ region: null });
      return;
    }
    let cancelled = false;
    setClientInfo(undefined);
    void (async () => {
      const r = await clientRegion(client);
      if (cancelled) return;
      setClientInfo({ region: r });
      if (!r) return;
      if (!settings.region()) setRegion(r);
      const s = await currentPlayer(client).catch(() => null);
      if (cancelled || !s) return;
      const ref = toRef(s, r);
      setMe(ref);
      settings.setMe(ref);
      setSelected((current) => current ?? ref);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const open = (player: PlayerRef) => {
    setSelected(player);
    contentRef.current?.scrollIntoView?.({ block: 'start' });
    if (same(player, me)) return;
    setRecent((prev) => {
      const next = [player, ...prev.filter((p) => !same(p, player))].slice(0, MAX_RECENT);
      settings.setRecentPlayers(next);
      return next;
    });
  };

  // Keep saved names and icons current: Riot IDs and icons can change.
  const refreshSaved = (ref: PlayerRef) => {
    const update = (list: PlayerRef[]) => {
      const i = list.findIndex((p) => same(p, ref));
      if (i === -1) return list;
      const p = list[i]!;
      if (p.gameName === ref.gameName && p.tagLine === ref.tagLine && p.profileIconId === ref.profileIconId && p.puuid === ref.puuid) return list;
      return list.map((x, j) => (j === i ? ref : x));
    };
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
    setMe((prev) => {
      if (!prev) return prev;
      const [next] = update([prev]);
      if (next !== prev && next) settings.setMe(next);
      return next ?? prev;
    });
  };

  const chooseMe = (player: PlayerRef) => {
    setMe(player);
    settings.setMe(player);
    setRecent((prev) => {
      const next = prev.filter((p) => !same(p, player));
      if (next.length !== prev.length) settings.setRecentPlayers(next);
      return next;
    });
  };

  const togglePin = (player: PlayerRef) => {
    setPinned((prev) => {
      const next = prev.some((p) => same(p, player)) ? prev.filter((p) => !same(p, player)) : [...prev, player];
      settings.setPinnedPlayers(next);
      return next;
    });
  };

  const changeRegion = (value: string) => {
    const r = value as Region;
    setRegion(r);
    settings.setRegion(r);
    if (search.status === 'error') setSearch({ status: 'idle' });
  };

  const submit = async () => {
    const source = sourceFor(region);
    if (!source) return;
    const id = parseRiotId(query);
    if (!id) {
      setSearch({ status: 'error', message: 'Type a Riot ID with its tag, like Name#NA1.' });
      return;
    }
    setSearch({ status: 'searching' });
    try {
      const found = await source.find(id.gameName, id.tagLine);
      if (!found) {
        setSearch({ status: 'error', message: `No player called ${id.gameName}#${id.tagLine} in ${REGION_LABELS[region]}. Check the spelling, tag and region.` });
        return;
      }
      setSearch({ status: 'idle' });
      setQuery('');
      open(toRef(found, region));
    } catch (err) {
      const retry = source.kind === 'client' ? 'Check that League is still open.' : 'Check your connection and try again.';
      setSearch({ status: 'error', message: `${(err as Error).message.replace(/\.?$/, '.')} ${retry}` });
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

  if (!opgg && !client) {
    return (
      <div className={styles.waiting}>
        <EmptyState
          icon={<MonitorSmartphone size={24} />}
          title="Player stats need the desktop app"
          description="Open Hex Cards for Windows to look up any player's rank, form and match history. League doesn't need to be running."
        />
      </div>
    );
  }

  const isPinned = (p: PlayerRef) => pinned.some((x) => same(x, p));
  const others = recent.filter((p) => !isPinned(p) && !same(p, me));
  // Until the client says which server it's on, wait rather than load from OP.GG and then again from the client.
  const source = selected && clientInfo !== undefined ? sourceFor(selected.region) : null;

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
          <Select label="Region" value={region} onValueChange={changeRegion} options={REGION_OPTIONS} />
          <Button type="submit" variant="secondary" size="sm" loading={search.status === 'searching'} disabled={!query.trim()}>
            Look up player
          </Button>
          <p id="player-search-hint" className={styles.hint} data-error={search.status === 'error' || undefined} role={search.status === 'error' ? 'alert' : undefined}>
            {search.status === 'error' ? search.message : 'Anyone\'s Riot ID and tag. League doesn\'t need to be open.'}
          </p>
        </form>

        <div className={styles.group}>
          <span className={styles.railTitle}>You</span>
          {me ? (
            <PlayerRow player={me} version={version} active={same(selected, me)} onSelect={() => open(me)} />
          ) : (
            <p className={styles.caption}>Look yourself up and choose This is me, and your stats open here first.</p>
          )}
        </div>

        <div className={styles.group}>
          <span className={styles.railTitle}>Pinned</span>
          {pinned.length === 0 ? (
            <p className={styles.caption}>Pin friends and rivals from their profile to keep them here.</p>
          ) : (
            pinned.map((p) => <PlayerRow key={playerKey(p)} player={p} version={version} active={same(selected, p)} onSelect={() => open(p)} />)
          )}
        </div>

        {others.length > 0 && (
          <div className={styles.group}>
            <span className={styles.railTitle}>Recently looked up</span>
            {others.map((p) => <PlayerRow key={playerKey(p)} player={p} version={version} active={same(selected, p)} onSelect={() => open(p)} />)}
          </div>
        )}

        <p className={styles.caption}>
          Summoner's Rift games only. Stats come from your League client when it's open, and from OP.GG when it isn't.
        </p>
      </aside>

      <div className={styles.content} ref={contentRef}>
        {selected && source ? (
          <PlayerProfile
            key={`${playerKey(selected)}:${source.kind}`}
            source={source}
            player={selected}
            isYou={same(selected, me)}
            pinned={isPinned(selected)}
            onTogglePin={togglePin}
            onSetMe={chooseMe}
            onResolved={refreshSaved}
            onOpenPlayer={open}
            onOpenChampion={onOpenChampion}
            version={version}
            champions={champions}
            items={items}
            runes={runes}
          />
        ) : !selected ? (
          <EmptyState
            icon={<Users size={24} />}
            title="Look up a player"
            description="Search a Riot ID to see their rank, recent form, best champions and match history. Start with yourself."
            action={<Button variant="secondary" onClick={() => searchRef.current?.focus()}>Search players</Button>}
          />
        ) : null}
      </div>
    </div>
  );
}
