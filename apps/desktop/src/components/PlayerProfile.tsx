import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, RotateCw, Lock } from 'lucide-react';
import {
  ROLE_LABELS, championIconUrl, profileIconUrl, rankEmblemUrl, roleIconUrl,
  type ChampionInfo, type ItemInfo, type LcuGame, type LcuRankedQueue, type LcuSummoner, type RuneData,
} from '@hexcards/data';
import {
  QUEUE_FILTER_LABELS, championForm, inQueue, playerGames, roleForm, streak, totals,
  type LcuClient, type PlayerGame, type QueueFilter,
} from '@hexcards/engine';
import { Badge } from './arc/badge/badge';
import { Button } from './arc/button/button';
import { EmptyState } from './arc/empty-state/empty-state';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Skeleton } from './arc/skeleton/skeleton';
import { MatchList } from './MatchList';
import { HISTORY_PAGE, PlayerLookupError, matchHistory, rankedStats, summonerByPuuid, type PlayerRef, type Ranks } from '../lcu/players';
import styles from './PlayerProfile.module.css';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => x.toFixed(1);
const TIER_NAMES: Record<string, string> = {
  IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', EMERALD: 'Emerald',
  DIAMOND: 'Diamond', MASTER: 'Master', GRANDMASTER: 'Grandmaster', CHALLENGER: 'Challenger',
};
/** Master and above have no divisions. */
const rankName = (q: LcuRankedQueue) => `${TIER_NAMES[q.tier] ?? q.tier}${q.division && q.division !== 'NA' && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(q.tier) ? ` ${q.division}` : ''}`;

/** How many games the page asks the client for on open: two pages, so a few remakes or ARAMs still leave a useful sample. */
const FIRST_LOAD = 2;
/** Match history rows shown at first, and added per "show more". The stats above use every loaded game. */
const ROWS = 10;

interface PlayerProfileProps {
  client: LcuClient;
  player: PlayerRef;
  isYou: boolean;
  pinned: boolean;
  onTogglePin: (player: PlayerRef) => void;
  /** The player's latest name and icon, once the client has said. */
  onResolved: (player: LcuSummoner) => void;
  onOpenPlayer: (player: PlayerRef) => void;
  onOpenChampion: (championId: number) => void;
  version: string;
  champions: Map<number, ChampionInfo>;
  items: Map<number, ItemInfo>;
  runes: RuneData | null;
}

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
function Form({ games }: { games: PlayerGame[] }) {
  const s = streak(games);
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
  client, player, isYou, pinned, onTogglePin, onResolved, onOpenPlayer, onOpenChampion, version, champions, items, runes,
}: PlayerProfileProps) {
  const [summoner, setSummoner] = useState<LcuSummoner | null>(null);
  const [ranks, setRanks] = useState<Ranks | null>(null);
  const [history, setHistory] = useState<Load<LcuGame[]>>({ status: 'loading' });
  const [more, setMore] = useState<{ loading: boolean; done: boolean; error?: string }>({ loading: false, done: false });
  const [queue, setQueue] = useState<QueueFilter>('all');
  const [rows, setRows] = useState(ROWS);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHistory((h) => (h.status === 'ready' && refresh > 0 ? h : { status: 'loading' }));
    setMore({ loading: false, done: false });
    setBusy(true);
    summonerByPuuid(client, player.puuid)
      .then((s) => {
        if (cancelled) return;
        setSummoner(s);
        onResolved(s);
      })
      .catch(() => {
        // The name and icon we already have still show.
      });
    rankedStats(client, player.puuid).then((r) => !cancelled && setRanks(r)).catch(() => !cancelled && setRanks({ solo: null, flex: null }));
    Promise.all(Array.from({ length: FIRST_LOAD }, (_, i) => matchHistory(client, player.puuid, i * HISTORY_PAGE)))
      .then((pages) => {
        if (cancelled) return;
        setBusy(false);
        const games = dedupe(pages.flat());
        setHistory({ status: 'ready', value: games });
        if (pages[pages.length - 1]!.length < HISTORY_PAGE) setMore({ loading: false, done: true });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setBusy(false);
        setHistory({ status: 'error', message: err.message, private: err instanceof PlayerLookupError && err.message.includes('private') });
      });
    return () => {
      cancelled = true;
    };
  }, [client, player.puuid, refresh]);

  const loadMore = () => {
    if (history.status !== 'ready') return;
    setMore({ loading: true, done: false });
    matchHistory(client, player.puuid, Math.ceil(history.value.length / HISTORY_PAGE) * HISTORY_PAGE)
      .then((page) => {
        setHistory((h) => (h.status === 'ready' ? { status: 'ready', value: dedupe([...h.value, ...page]) } : h));
        setRows((n) => n + ROWS);
        setMore({ loading: false, done: page.length < HISTORY_PAGE });
      })
      .catch((err: Error) => setMore({ loading: false, done: false, error: err.message }));
  };

  const lines = useMemo(() => (history.status === 'ready' ? playerGames(history.value, player.puuid) : []), [history, player.puuid]);
  const shown = useMemo(() => lines.filter((g) => inQueue(g.queueId, queue)), [lines, queue]);
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
              {level !== undefined && <span className={styles.meta}>Level {level}</span>}
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={() => setRefresh((n) => n + 1)} loading={busy && refresh > 0}>
            <RotateCw size={16} aria-hidden /> Refresh
          </Button>
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
          description={history.private ? 'This player has hidden their games in the League client, so there are no stats to show.' : `${history.message} Check that League is still open, then try again.`}
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
                    ? `${shown.length} Summoner's Rift ${shown.length === 1 ? 'game' : 'games'}${queue === 'all' ? '' : ` in ${QUEUE_FILTER_LABELS[queue]}`}${skipped > 0 ? `. ${skipped} ARAM, Arena or remade ${skipped === 1 ? 'game is' : 'games are'} left out.` : '.'}`
                    : 'Reading match history from the League client'}
                </p>
              </div>
              <SegmentedControl
                label="Queue"
                value={queue}
                onValueChange={(v) => setQueue(v as QueueFilter)}
                options={(['all', 'solo', 'flex', 'normal'] as QueueFilter[]).map((q) => ({ value: q, label: q === 'all' ? 'All' : q === 'solo' ? 'Solo/Duo' : q === 'flex' ? 'Flex' : 'Normal' }))}
              />
            </div>

            {!loaded ? (
              <div className={styles.stats}>
                {[0, 1, 2, 3].map((i) => <div key={i} className={styles.stat}><Skeleton label="Loading stats" lines={2} /></div>)}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState
                title={queue === 'all' ? 'No Summoner\'s Rift games yet' : `No ${QUEUE_FILTER_LABELS[queue]} games`}
                description={queue === 'all' ? 'Recent games are all on other maps. Rift games show here once this player has some.' : 'None of the recent games were in this queue. Pick All to see every Rift game.'}
                action={queue === 'all' ? undefined : <Button variant="secondary" onClick={() => setQueue('all')}>Show all queues</Button>}
              />
            ) : (
              <>
                <div className={styles.stats}>
                  <Stat label="Win rate" value={pct(t.winRate)} context={`${t.wins}W ${t.losses}L`} />
                  <Stat label="KDA" value={t.kda.toFixed(2)} context={`${one(t.kills)} / ${one(t.deaths)} / ${one(t.assists)} per game`} />
                  <Stat label="CS per minute" value={one(t.csPerMin)} context={`${Math.round(t.goldPerMin)} gold per minute`} />
                  <Stat label="Damage per minute" value={Math.round(t.damagePerMin).toLocaleString()} context={`${one(t.visionPerMin)} vision score per minute`} />
                </div>
                <Form games={shown} />
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
                client={client}
                puuid={player.puuid}
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
