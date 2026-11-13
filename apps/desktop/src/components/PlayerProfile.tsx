import { useEffect, useMemo, useState } from 'react';
import { Lock, Pin, PinOff, RotateCw, UserRound, X } from 'lucide-react';
import {
  ROLE_LABELS, championIconUrl, profileIconUrl, rankEmblemUrl, roleIconUrl,
  type ChampionInfo, type ItemInfo, type LcuGame, type LcuRankedQueue, type LcuSummoner, type RuneData,
} from '@hexcards/data';
import {
  championForm, filterChoices, filterGames, playerGames, queueName, roleForm, streak, totals,
  type GameFilter, type PlayerGame,
} from '@hexcards/engine';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { EmptyState } from './arc/empty-state/empty-state';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Select } from './arc/select/select';
import { Skeleton } from './arc/skeleton/skeleton';
import { MatchList } from './MatchList';
import { HISTORY_PAGE, PlayerLookupError, toRef, type PlayerRef, type PlayerSource, type Ranks } from '../lcu/players';
import styles from './PlayerProfile.module.css';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => x.toFixed(1);
const TIER_NAMES: Record<string, string> = {
  IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', EMERALD: 'Emerald',
  DIAMOND: 'Diamond', MASTER: 'Master', GRANDMASTER: 'Grandmaster', CHALLENGER: 'Challenger',
};
/** Master and above have no divisions. */
const rankName = (q: LcuRankedQueue) => `${TIER_NAMES[q.tier] ?? q.tier}${q.division && q.division !== 'NA' && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(q.tier) ? ` ${q.division}` : ''}`;

/** How many pages to ask for on open: two, so a few remakes or ARAMs still leave a useful sample (OP.GG has one). */
const FIRST_LOAD = 2;
/** Match history rows shown at first, and added per "show more". The stats above use every loaded game. */
const ROWS = 10;

interface PlayerProfileProps {
  /** Where this player's stats come from: the League client, or OP.GG when it isn't running. */
  source: PlayerSource;
  player: PlayerRef;
  isYou: boolean;
  pinned: boolean;
  onTogglePin: (player: PlayerRef) => void;
  /** Remembers this player as you, so your stats open first, with or without League. */
  onSetMe: (player: PlayerRef) => void;
  /** The player's latest name and icon, once the source has said. */
  onResolved: (player: PlayerRef) => void;
  onOpenPlayer: (player: PlayerRef) => void;
  onOpenChampion: (championId: number) => void;
  version: string;
  champions: Map<number, ChampionInfo>;
  items: Map<number, ItemInfo>;
  runes: RuneData | null;
}

type Filters = Required<GameFilter>;
const NO_FILTERS: Filters = { mode: 'all', championId: 'all', role: 'all', result: 'all' };

type Load<T> = { status: 'loading' } | { status: 'error'; message: string; private?: boolean } | { status: 'ready'; value: T };

function RankCard({ label, queue }: { label: string; queue: LcuRankedQueue | null }) {
  // The crest is decoration; if CommunityDragon can't serve it, the plain slot stays.
  const [crest, setCrest] = useState(true);
  if (!queue) {
    return (
      <div className={styles.rank} data-unranked>
        <span className={styles.emblemSlot} aria-hidden />
        <div className={styles.rankText}>
          <span className={styles.rankLabel}>{label}</span>
          <span className={styles.rankName}>Unranked</span>
          <span className={styles.rankMeta}>No ranked games this split</span>
        </div>
      </div>
    );
  }
  const games = queue.wins + queue.losses;
  return (
    <div className={styles.rank}>
      <span className={styles.emblemSlot}>
        {crest && <img className={styles.emblem} src={rankEmblemUrl(queue.tier)} alt="" draggable={false} onError={() => setCrest(false)} />}
      </span>
      <div className={styles.rankText}>
        <span className={styles.rankLabel}>{label}</span>
        <span className={styles.rankName}>
          {rankName(queue)} <span className={styles.lp}>{queue.leaguePoints} LP</span>
        </span>
        <span className={styles.rankMeta}>
          {queue.isProvisional
            ? `In placements, ${queue.provisionalGamesRemaining ?? 0} games to go`
            : `${queue.wins}W ${queue.losses}L · ${games ? pct(queue.wins / games) : '0%'} win rate`}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statContext}>{context}</span>
    </div>
  );
}

/** The newest results left to right, like the client's recent games strip. */
function Form({ games, showStreak }: { games: PlayerGame[]; showStreak: boolean }) {
  // Wins-only or losses-only lists are all one result: a streak there would mean nothing.
  const s = showStreak ? streak(games) : null;
  const shown = games.slice(0, 20);
  return (
    <div className={styles.form}>
      <ol className={styles.formStrip} aria-label={`Last ${shown.length} games, newest first: ${shown.filter((g) => g.win).length} wins`}>
        {shown.map((g) => (
          <li key={g.gameId} data-win={g.win || undefined} title={g.win ? 'Win' : 'Loss'}>
            {g.win ? 'W' : 'L'}
          </li>
        ))}
      </ol>
      {s && s.length >= 2 && (
        <span className={styles.streak}>
          {s.length} {s.win ? 'wins' : 'losses'} in a row
        </span>
      )}
    </div>
  );
}

export function PlayerProfile({
  source, player, isYou, pinned, onTogglePin, onSetMe, onResolved, onOpenPlayer, onOpenChampion, version, champions, items, runes,
}: PlayerProfileProps) {
  const [summoner, setSummoner] = useState<LcuSummoner | null>(null);
  const [ranks, setRanks] = useState<Ranks | null>(null);
  const [history, setHistory] = useState<Load<LcuGame[]>>({ status: 'loading' });
  const [more, setMore] = useState<{ loading: boolean; done: boolean; error?: string }>({ loading: false, done: false });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const setFilter = (next: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...next }));
    setRows(ROWS);
  };
  const [rows, setRows] = useState(ROWS);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHistory((h) => (h.status === 'ready' && refresh > 0 ? h : { status: 'loading' }));
    if (refresh === 0) setRanks(null);
    setMore({ loading: false, done: !source.paged });
    setBusy(true);
    const fail = (err: Error) => {
      if (cancelled) return;
      setBusy(false);
      setRanks((r) => r ?? { solo: null, flex: null });
      setHistory({ status: 'error', message: err.message, private: err instanceof PlayerLookupError && err.message.includes('private') });
    };
    // First the player as this source knows them, then their rank and games.
    source.resolve(player)
      .then((s) => {
        if (cancelled) return;
        setSummoner(s);
        onResolved(toRef(s, player.region));
        source.ranks(s).then((r) => !cancelled && setRanks(r)).catch(() => !cancelled && setRanks({ solo: null, flex: null }));
        return Promise.all(Array.from({ length: source.paged ? FIRST_LOAD : 1 }, (_, i) => source.history(s, i * HISTORY_PAGE))).then((pages) => {
          if (cancelled) return;
          setBusy(false);
          setHistory({ status: 'ready', value: dedupe(pages.flat()) });
          if (!source.paged || pages[pages.length - 1]!.length === 0) setMore({ loading: false, done: true });
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [source, player.puuid, player.gameName, player.tagLine, player.region, refresh]);

  const loadMore = () => {
    if (history.status !== 'ready' || !summoner) return;
    setMore({ loading: true, done: false });
    source.history(summoner, Math.ceil(history.value.length / HISTORY_PAGE) * HISTORY_PAGE)
      .then((page) => {
        setHistory((h) => (h.status === 'ready' ? { status: 'ready', value: dedupe([...h.value, ...page]) } : h));
        setRows((n) => n + ROWS);
        // A merged source can drop games it already showed, so only an empty page means the end.
        setMore({ loading: false, done: page.length === 0 });
      })
      .catch((err: Error) => setMore({ loading: false, done: false, error: err.message }));
  };

  const puuid = summoner?.puuid ?? player.puuid;
  const lines = useMemo(() => (history.status === 'ready' ? playerGames(history.value, puuid) : []), [history, puuid]);
  const shown = useMemo(() => filterGames(lines, filters), [lines, filters]);
  const filtered = Object.values(filters).some((v) => v !== 'all');
  // Each list offers what's in the loaded games, with how many; a choice stays listed while picked.
  const choices = useMemo(() => {
    const keep = <T,>(list: [T, number][], picked: T | 'all') => (picked === 'all' || list.some(([v]) => v === picked) ? list : [...list, [picked, 0] as [T, number]]);
    return {
      modes: keep(filterChoices(lines, (g) => queueName(g.queueId)), filters.mode),
      champions: keep(filterChoices(lines, (g) => g.championId), filters.championId),
      roles: keep(filterChoices(lines, (g) => g.role), filters.role),
    };
  }, [lines, filters]);
  const t = useMemo(() => totals(shown), [shown]);
  const championRows = useMemo(() => championForm(shown).slice(0, 6), [shown]);
  const roles = useMemo(() => roleForm(shown), [shown]);

  const who = summoner ?? player;
  const level = summoner?.summonerLevel;
  const loaded = history.status === 'ready';
  const skipped = loaded ? history.value.length - lines.length : 0;

  return (
    <div className={styles.profile}>
      <header className={styles.head}>
        <div className={styles.identity}>
          <span className={styles.iconWrap}>
            <img className={styles.icon} src={profileIconUrl(version, who.profileIconId)} alt="" draggable={false} />
            {level !== undefined && <span className={styles.levelChip}>{level}</span>}
          </span>
          <div className={styles.nameBlock}>
            <h1 className={styles.name}>
              {who.gameName}
              <span className={styles.tag}>#{who.tagLine}</span>
            </h1>
            <div className={styles.badges}>
              {isYou && <Badge tone="info" size="sm">You</Badge>}
              <span className={styles.meta}>{level !== undefined ? `Level ${level} · ` : ''}{player.region}</span>
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={() => setRefresh((n) => n + 1)} loading={busy && refresh > 0}>
            <RotateCw size={16} aria-hidden /> Refresh
          </Button>
          {!isYou && (
            <Button variant="ghost" size="sm" onClick={() => onSetMe(summoner ? toRef(summoner, player.region) : player)}>
              <UserRound size={16} aria-hidden /> This is me
            </Button>
          )}
          {!isYou && (
            <Button variant="secondary" size="sm" onClick={() => onTogglePin({ ...player, ...(summoner ? { gameName: summoner.gameName, tagLine: summoner.tagLine, profileIconId: summoner.profileIconId } : {}) })}>
              {pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
              {pinned ? 'Unpin player' : 'Pin player'}
            </Button>
          )}
        </div>
      </header>

      <section className={styles.ranks} aria-label="Ranked">
        {ranks ? (
          <>
            <RankCard label="Ranked Solo/Duo" queue={ranks.solo} />
            <RankCard label="Ranked Flex" queue={ranks.flex} />
          </>
        ) : (
          <>
            <div className={styles.rank}><Skeleton label="Loading rank" lines={2} avatar /></div>
            <div className={styles.rank}><Skeleton label="Loading rank" lines={2} avatar /></div>
          </>
        )}
      </section>

      {history.status === 'error' ? (
        <EmptyState
          icon={history.private ? <Lock size={24} /> : undefined}
          title={history.private ? 'Match history is private' : 'Couldn\'t load match history'}
          description={history.private
            ? 'This player has hidden their games in the League client, so there are no stats to show.'
            : `${history.message} ${source.kind === 'client' ? 'Check that League is still open, then try again.' : 'Check the Riot ID, region and your connection, then try again.'}`}
          action={history.private ? undefined : <Button variant="secondary" onClick={() => setRefresh((n) => n + 1)}>Try again</Button>}
        />
      ) : (
        <>
          <section className={styles.section} aria-labelledby="form-heading">
            <div className={styles.sectionHead}>
              <div>
                <h2 id="form-heading" className={styles.sectionTitle}>Recent form</h2>
                <p className={styles.note}>
                  {loaded
                    ? `${lines.length} Summoner's Rift ${lines.length === 1 ? 'game' : 'games'} from ${source.label}.${skipped > 0 ? ` ${skipped} ARAM, Arena or remade ${skipped === 1 ? 'game is' : 'games are'} left out.` : ''}`
                    : `Reading match history from ${source.label}`}
                </p>
                {loaded && source.kind === 'opgg' && (
                  <p className={styles.caption}>OP.GG keeps a player's last 20 games. With League open, players on your server also get the client's recent games.</p>
                )}
              </div>
            </div>

            {loaded && lines.length > 0 && (
              <div className={styles.filters} role="group" aria-label="Filter games">
                <Select
                  label="Game mode"
                  value={filters.mode}
                  onValueChange={(v) => setFilter({ mode: v })}
                  options={[{ value: 'all', label: `All modes (${lines.length})` }, ...choices.modes.map(([m, n]) => ({ value: m, label: `${m} (${n})` }))]}
                />
                <Select
                  label="Champion"
                  value={String(filters.championId)}
                  onValueChange={(v) => setFilter({ championId: v === 'all' ? 'all' : Number(v) })}
                  options={[{ value: 'all', label: `All champions (${choices.champions.length})` }, ...choices.champions.map(([id, n]) => ({ value: String(id), label: `${champions.get(id)?.name ?? `Champion ${id}`} (${n})` }))]}
                />
                <Select
                  label="Role"
                  value={filters.role}
                  onValueChange={(v) => setFilter({ role: v as Filters['role'] })}
                  options={[{ value: 'all', label: 'All roles' }, ...choices.roles.map(([r, n]) => ({ value: r, label: `${ROLE_LABELS[r]} (${n})` }))]}
                />
                <div className={styles.resultFilter}>
                  <span className={styles.filterLabel} aria-hidden>Result</span>
                  <SegmentedControl
                    label="Result"
                    value={filters.result}
                    onValueChange={(v) => setFilter({ result: v as Filters['result'] })}
                    options={[{ value: 'all', label: 'All' }, { value: 'wins', label: 'Wins' }, { value: 'losses', label: 'Losses' }]}
                  />
                </div>
                {filtered && (
                  <div className={styles.filterSummary}>
                    <span>Showing {shown.length} of {lines.length} games</span>
                    <Button variant="ghost" size="sm" onClick={() => setFilter(NO_FILTERS)}>
                      <X size={16} aria-hidden /> Clear filters
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!loaded ? (
              <div className={styles.stats}>
                {[0, 1, 2, 3].map((i) => <div key={i} className={styles.stat}><Skeleton label="Loading stats" lines={2} /></div>)}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState
                title={lines.length === 0 ? 'No Summoner\'s Rift games yet' : 'No games match these filters'}
                description={lines.length === 0 ? 'Recent games are all on other maps. Rift games show here once this player has some.' : 'None of the loaded games fit every filter. Clear one to see more.'}
                action={lines.length === 0 ? undefined : <Button variant="secondary" onClick={() => setFilter(NO_FILTERS)}>Clear filters</Button>}
              />
            ) : (
              <>
                <div className={styles.stats}>
                  <Stat label="Win rate" value={pct(t.winRate)} context={`${t.wins}W ${t.losses}L`} />
                  <Stat label="KDA" value={t.kda.toFixed(2)} context={`${one(t.kills)} / ${one(t.deaths)} / ${one(t.assists)} per game`} />
                  <Stat label="CS per minute" value={one(t.csPerMin)} context={`${Math.round(t.goldPerMin)} gold per minute`} />
                  <Stat
                    label="Damage per minute"
                    value={Math.round(t.damagePerMin).toLocaleString()}
                    context={t.visionPerMin !== null ? `${one(t.visionPerMin)} vision score per minute` : `${Math.round(t.damage).toLocaleString()} to champions per game`}
                  />
                </div>
                <Form games={shown} showStreak={filters.result === 'all'} />
              </>
            )}
          </section>

          {loaded && shown.length > 0 && (
            <div className={styles.split}>
              <section className={styles.section} aria-labelledby="champions-heading">
                <h2 id="champions-heading" className={styles.sectionTitle}>Champions</h2>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Champion</th>
                        <th scope="col">Games</th>
                        <th scope="col">Win rate</th>
                        <th scope="col">KDA</th>
                        <th scope="col" className={styles.hideNarrow}>CS/min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {championRows.map((c) => {
                        const champion = champions.get(c.championId);
                        return (
                          <tr key={c.championId}>
                            <td>
                              <button type="button" className={styles.championButton} onClick={() => onOpenChampion(c.championId)} title={champion ? `Open ${champion.name} builds` : undefined}>
                                {champion && <img src={championIconUrl(version, champion.key)} alt="" draggable={false} />}
                                <span>{champion?.name ?? `Champion ${c.championId}`}</span>
                              </button>
                            </td>
                            <td className={styles.num}>{c.games}</td>
                            <td className={styles.num}>
                              <span className={styles.rate}>
                                <span>{pct(c.winRate)}</span>
                                <span className={styles.rateBar} aria-hidden><span style={{ width: pct(c.winRate) }} /></span>
                              </span>
                              <span className={styles.sub}>{c.wins}W {c.losses}L</span>
                            </td>
                            <td className={styles.num}>
                              <span>{c.kda.toFixed(2)}</span>
                              <span className={styles.sub}>{one(c.kills)}/{one(c.deaths)}/{one(c.assists)}</span>
                            </td>
                            <td className={`${styles.num} ${styles.hideNarrow}`}>{one(c.csPerMin)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="roles-heading">
                <h2 id="roles-heading" className={styles.sectionTitle}>Roles</h2>
                {roles.length === 0 ? (
                  <p className={styles.note}>The client didn't record a role for these games.</p>
                ) : (
                  <ul className={styles.roles}>
                    {roles.map((r) => (
                      <li key={r.role} className={styles.role}>
                        <img src={roleIconUrl(r.role)} alt="" />
                        <span className={styles.roleName}>{ROLE_LABELS[r.role]}</span>
                        <span className={styles.roleBar} aria-hidden><span style={{ width: pct(r.share) }} /></span>
                        <span className={styles.roleShare}>{pct(r.share)}</span>
                        <span className={styles.sub}>{r.wins}W {r.games - r.wins}L</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {loaded && shown.length > 0 && (
            <section className={styles.section} aria-labelledby="history-heading">
              <h2 id="history-heading" className={styles.sectionTitle}>Match history</h2>
              <MatchList
                loadGame={(gameId) => source.game(summoner!, gameId)}
                puuid={puuid}
                region={player.region}
                games={shown.slice(0, rows)}
                version={version}
                champions={champions}
                items={items}
                runes={runes}
                onOpenPlayer={onOpenPlayer}
                onOpenChampion={onOpenChampion}
              />
            </section>
          )}

          {loaded && (rows < shown.length || !more.done) && (
            <div className={styles.more}>
              {more.error && <p className={styles.error} role="alert">{more.error}</p>}
              {rows < shown.length ? (
                <Button variant="secondary" onClick={() => setRows((n) => n + ROWS)}>Show more games</Button>
              ) : (
                <Button variant="secondary" onClick={loadMore} loading={more.loading}>Load older games</Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Pages can overlap when a game finishes between requests. */
function dedupe(games: LcuGame[]): LcuGame[] {
  const seen = new Set<number>();
  return games.filter((g) => !seen.has(g.gameId) && !!seen.add(g.gameId));
}
