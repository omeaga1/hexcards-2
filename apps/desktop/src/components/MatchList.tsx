import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  ROLE_LABELS, SUMMONER_SPELLS, championIconUrl, summonerSpellIconUrl,
  type ChampionInfo, type ItemInfo, type LcuGame, type RuneData,
} from '@hexcards/data';
import { kdaRatio, killParticipation, queueName, type PlayerGame } from '@hexcards/engine';
import { Button } from './arc/button/button';
import { Skeleton } from './arc/skeleton/skeleton';
import { ItemIcon } from './ItemIcon';
import type { PlayerRef } from '../lcu/players';
import type { Region } from '@hexcards/data';
import styles from './MatchList.module.css';

const ago = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
/** "2 hours ago", "yesterday", "3 days ago". */
function timeAgo(at: number, now: number) {
  const minutes = Math.round((at - now) / 60_000);
  if (minutes > -60) return ago.format(Math.min(-1, minutes), 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return ago.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days > -30) return ago.format(days, 'day');
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const duration = (minutes: number) => `${Math.floor(minutes)}:${String(Math.round((minutes % 1) * 60)).padStart(2, '0')}`;
const thousands = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

interface Shared {
  version: string;
  champions: Map<number, ChampionInfo>;
  items: Map<number, ItemInfo>;
  runes: RuneData | null;
}

interface MatchListProps extends Shared {
  /** One game with all ten players, from the same source as the list. */
  loadGame: (gameId: number) => Promise<LcuGame>;
  /** The player whose history this is, as the source knows them. */
  puuid: string;
  /** Players in these games are on this region. */
  region: Region;
  games: PlayerGame[];
  /** Called with a player from an opened game, to look them up. */
  onOpenPlayer: (player: PlayerRef) => void;
  onOpenChampion: (championId: number) => void;
}

function Spells({ version, spells }: { version: string; spells: [number, number] }) {
  return (
    <span className={styles.spells}>
      {spells.map((id, i) => {
        const spell = SUMMONER_SPELLS[id];
        return spell
          ? <img key={i} src={summonerSpellIconUrl(version, spell.key)} alt={spell.name} title={spell.name} draggable={false} />
          : <span key={i} className={styles.blank} title={`Spell ${id}`} />;
      })}
    </span>
  );
}

function Runes({ runes, keystone, subStyle }: { runes: RuneData | null; keystone: number; subStyle: number }) {
  const key = runes?.perks.get(keystone);
  const sub = runes?.styles.get(subStyle);
  return (
    <span className={styles.runes}>
      {key ? <img className={styles.keystone} src={key.icon} alt={key.name} title={key.name} draggable={false} /> : <span className={styles.blank} />}
      {sub ? <img className={styles.subStyle} src={sub.icon} alt={sub.name} title={sub.name} draggable={false} /> : <span className={styles.blank} />}
    </span>
  );
}

function Items({ version, items, ids, size }: { version: string; items: Map<number, ItemInfo>; ids: number[]; size: 'md' | 'sm' }) {
  return (
    <span className={styles.items} data-size={size}>
      {ids.map((id, i) => (id ? <ItemIcon key={i} version={version} itemId={id} item={items.get(id)} size={size} /> : <span key={i} className={styles.emptySlot} data-size={size} />))}
    </span>
  );
}

/** Both teams from one game, as the client's post-game screen lists them. */
function GameDetail({ game, puuid, region, onOpenPlayer, ...shared }: Shared & { game: LcuGame; puuid: string; region: Region; onOpenPlayer: (p: PlayerRef) => void }) {
  const { version, champions, items } = shared;
  const identity = (id: number) => game.participantIdentities.find((i) => i.participantId === id)?.player;
  const mostDamage = Math.max(1, ...game.participants.map((p) => p.stats.totalDamageDealtToChampions));
  const minutes = game.gameDuration / 60;
  const teams = [100, 200].map((teamId) => {
    const members = game.participants.filter((p) => p.teamId === teamId);
    const won = members[0]?.stats.win ?? false;
    const kills = members.reduce((n, p) => n + p.stats.kills, 0);
    const gold = members.reduce((n, p) => n + p.stats.goldEarned, 0);
    return { teamId, members, won, kills, gold };
  });
  return (
    <div className={styles.detail}>
      {teams.map((t) => (
        <section key={t.teamId} className={styles.team} aria-label={`${t.teamId === 100 ? 'Blue' : 'Red'} team`}>
          <header className={styles.teamHead}>
            <span className={styles.teamResult} data-win={t.won || undefined}>{t.won ? 'Victory' : 'Defeat'}</span>
            <span className={styles.teamSide}>{t.teamId === 100 ? 'Blue side' : 'Red side'}</span>
            <span className={styles.teamTotals}>{t.kills} kills · {thousands(t.gold)} gold</span>
          </header>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">KDA</th>
                <th scope="col" className={styles.hideNarrow}>Damage</th>
                <th scope="col">CS</th>
                <th scope="col" className={styles.hideNarrow}>Items</th>
              </tr>
            </thead>
            <tbody>
              {t.members.map((p) => {
                const who = identity(p.participantId);
                const champion = champions.get(p.championId);
                const self = who?.puuid === puuid;
                const s = p.stats;
                const cs = s.totalMinionsKilled + s.neutralMinionsKilled;
                const name = who?.gameName || who?.summonerName || 'Unknown player';
                return (
                  <tr key={p.participantId} data-self={self || undefined}>
                    <td>
                      <span className={styles.who}>
                        {champion && <img className={styles.detailChampion} src={championIconUrl(version, champion.key)} alt={champion.name} title={champion.name} />}
                        <span className={styles.level}>{s.champLevel}</span>
                        {who?.puuid && !self ? (
                          <button
                            type="button"
                            className={styles.playerLink}
                            onClick={() => onOpenPlayer({ puuid: who.puuid, gameName: name, tagLine: who.tagLine ?? '', profileIconId: who.profileIcon ?? 29, region })}
                          >
                            {name}
                          </button>
                        ) : (
                          <span className={styles.playerName}>{name}</span>
                        )}
                      </span>
                    </td>
                    <td className={styles.num}>
                      <span>{s.kills}/{s.deaths}/{s.assists}</span>
                      <span className={styles.sub}>{Math.round(killParticipation(game, p) * 100)}% KP</span>
                    </td>
                    <td className={`${styles.num} ${styles.hideNarrow}`}>
                      <span>{s.totalDamageDealtToChampions.toLocaleString()}</span>
                      <span className={styles.damageBar} aria-hidden><span style={{ width: `${(s.totalDamageDealtToChampions / mostDamage) * 100}%` }} /></span>
                    </td>
                    <td className={styles.num}>
                      <span>{cs}</span>
                      <span className={styles.sub}>{(cs / minutes).toFixed(1)}/min</span>
                    </td>
                    <td className={styles.hideNarrow}>
                      <Items version={version} items={items} ids={[s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6]} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

type Detail = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; game: LcuGame };

export function MatchList({ loadGame, puuid, region, games, onOpenPlayer, onOpenChampion, ...shared }: MatchListProps) {
  const { version, champions, items, runes } = shared;
  const [open, setOpen] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Detail>>({});
  // Read once per list: rows say "2 hours ago" relative to when they were loaded.
  const [now] = useState(() => Date.now());

  const load = (gameId: number) => {
    setDetails((d) => ({ ...d, [gameId]: { status: 'loading' } }));
    loadGame(gameId)
      .then((game) => setDetails((d) => ({ ...d, [gameId]: { status: 'ready', game } })))
      .catch((err: Error) => setDetails((d) => ({ ...d, [gameId]: { status: 'error', message: err.message } })));
  };
  const toggle = (gameId: number) => {
    const next = open === gameId ? null : gameId;
    setOpen(next);
    if (next !== null && (!details[next] || details[next].status === 'error')) load(next);
  };

  return (
    <ol className={styles.list}>
      {games.map((g) => {
        const champion = champions.get(g.championId);
        const detail = details[g.gameId];
        const expanded = open === g.gameId;
        const panelId = `game-${g.gameId}`;
        return (
          <li key={g.gameId} className={styles.match} data-win={g.win || undefined} data-open={expanded || undefined}>
            <div className={styles.row}>
              <div className={styles.result}>
                <span className={styles.outcome}>{g.win ? 'Win' : 'Loss'}</span>
                <span className={styles.queue}>{queueName(g.queueId)}</span>
                <span className={styles.when}>{timeAgo(g.createdAt, now)} · {duration(g.minutes)}</span>
              </div>

              <div className={styles.loadout}>
                <button type="button" className={styles.champion} onClick={() => onOpenChampion(g.championId)} title={champion ? `Open ${champion.name} builds` : undefined}>
                  {champion && <img src={championIconUrl(version, champion.key)} alt={champion.name} draggable={false} />}
                  <span className={styles.level}>{g.level}</span>
                </button>
                <Spells version={version} spells={g.spells} />
                <Runes runes={runes} keystone={g.keystone} subStyle={g.subStyle} />
                <span className={styles.championName}>
                  {champion?.name ?? `Champion ${g.championId}`}
                  {g.role && <span className={styles.sub}>{ROLE_LABELS[g.role]}</span>}
                </span>
              </div>

              <div className={styles.kda}>
                <span className={styles.score}>
                  {g.kills} <span className={styles.slash}>/</span> <span className={styles.deaths}>{g.deaths}</span> <span className={styles.slash}>/</span> {g.assists}
                </span>
                <span className={styles.sub}>{kdaRatio(g.kills, g.deaths, g.assists).toFixed(2)} KDA</span>
              </div>

              <div className={styles.farm}>
                <span>{g.cs} CS</span>
                <span className={styles.sub}>{(g.cs / g.minutes).toFixed(1)}/min{g.vision !== null ? ` · ${g.vision} vision` : ''}</span>
              </div>

              <Items version={version} items={items} ids={g.items} size="md" />

              <button
                type="button"
                className={styles.expand}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={expanded ? 'Hide game details' : 'Show both teams'}
                onClick={() => toggle(g.gameId)}
              >
                <ChevronDown size={18} aria-hidden />
              </button>
            </div>

            {expanded && (
              <div id={panelId} className={styles.panel}>
                {(!detail || detail.status === 'loading') && <Skeleton label="Loading game" lines={5} />}
                {detail?.status === 'error' && (
                  <div className={styles.detailError} role="alert">
                    <p>{detail.message}</p>
                    <Button variant="secondary" size="sm" onClick={() => load(g.gameId)}>Try again</Button>
                  </div>
                )}
                {detail?.status === 'ready' && <GameDetail {...shared} game={detail.game} puuid={puuid} region={region} onOpenPlayer={onOpenPlayer} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
