import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { SearchField } from './arc/search-field/search-field';
import { BRACKET_LABELS, ROLE_LABELS, championIconUrl, type Bracket, type ChampionInfo, type Role } from '@hexcards/data';
import type { LaneMatchup, LaneMatchups } from '@hexcards/engine';
import styles from './Matchups.module.css';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
/** How far from the usual win rate fills a bar to its end. */
const BAR_RANGE = 0.12;
const normalize = (s: string) => s.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

interface MatchupsProps {
  version: string;
  champion: ChampionInfo;
  role: Role;
  bracket: Bracket;
  matchups: LaneMatchups;
  champions: Map<number, ChampionInfo>;
  /** In champ select: the enemy most likely in your lane, marked wherever it appears. */
  laneOpponent?: number;
  onOpen: (championId: number) => void;
}

/** The lane opponents that go worst and best for this champion in this role, from the bracket's games. */
export function Matchups({ version, champion, role, bracket, matchups, champions, laneOpponent, onOpen }: MatchupsProps) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const { usual, hardest, easiest, all } = matchups;

  const filtered = useMemo(() => {
    const q = normalize(query);
    return q ? all.filter((m) => normalize(champions.get(m.opponent)?.name ?? '').includes(q)) : all;
  }, [all, query, champions]);

  if (all.length === 0) return null;
  // In champ select, your likely lane gets its own row up top unless it's already in one of the lists.
  const yourLane = laneOpponent === undefined ? undefined : all.find((m) => m.opponent === laneOpponent);
  const pinLane = yourLane && ![...hardest, ...easiest].includes(yourLane);

  const row = (m: LaneMatchup) => {
    const c = champions.get(m.opponent);
    if (!c) return null;
    // The bar grows from the middle (this champion's usual win rate) toward the side the matchup leans.
    const lean = Math.max(-1, Math.min(1, (m.score - usual) / BAR_RANGE));
    const tone = m.score < usual ? 'hard' : 'easy';
    const yourLane = m.opponent === laneOpponent;
    return (
      <li key={m.opponent}>
        <button
          type="button"
          className={styles.row}
          data-lane={yourLane || undefined}
          onClick={() => onOpen(m.opponent)}
          title={`${champion.name} won ${m.wins.toLocaleString()} of ${m.games.toLocaleString()} games against ${c.name}. Open ${c.name}.`}
        >
          <img src={championIconUrl(version, c.key)} alt="" draggable={false} loading="lazy" />
          <span className={styles.who}>
            <span className={styles.name}>{c.name}</span>
            <span className={styles.games}>
              {yourLane && <span className={styles.laneTag}>Your lane · </span>}
              {m.games.toLocaleString()} games
            </span>
          </span>
          <span className={styles.bar} data-tone={tone} aria-hidden style={{ '--lean': lean } as CSSProperties}>
            <span />
          </span>
          <span className={styles.rate} data-tone={tone}>{pct(m.winRate)}</span>
        </button>
      </li>
    );
  };

  return (
    <section className={styles.section} aria-labelledby="matchups-heading">
      <div className={styles.head}>
        <h2 id="matchups-heading" className={styles.title}>Matchups</h2>
        <p className={styles.note}>
          {champion.name} wins {pct(usual)} of {ROLE_LABELS[role]} games in {BRACKET_LABELS[bracket]}. Bars show how each lane opponent moves that; matchups with few games count for less.
        </p>
      </div>

      {pinLane && (
        <div className={styles.column} data-pinned>
          <h3 className={styles.columnTitle}>In this champ select</h3>
          <ul className={styles.list}>{row(yourLane)}</ul>
        </div>
      )}

      <div className={styles.columns}>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Hardest lanes</h3>
          {hardest.length ? <ul className={styles.list}>{hardest.map(row)}</ul> : <p className={styles.note}>No lane goes clearly worse than usual.</p>}
        </div>
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Best lanes</h3>
          {easiest.length ? <ul className={styles.list}>{easiest.map(row)}</ul> : <p className={styles.note}>No lane goes clearly better than usual.</p>}
        </div>
      </div>

      <div className={styles.more}>
        <button type="button" className={styles.toggle} aria-expanded={showAll} aria-controls="all-matchups" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide matchups' : `Show all ${all.length} matchups`}
          <ChevronDown size={16} aria-hidden data-open={showAll || undefined} />
        </button>
      </div>

      {showAll && (
        <div id="all-matchups" className={styles.all}>
          <div className={styles.search}>
            <SearchField label="Find a matchup" placeholder="Champion name" value={query} onValueChange={setQuery} />
          </div>
          {filtered.length ? (
            <ul className={styles.grid}>{filtered.map(row)}</ul>
          ) : (
            <p className={styles.note}>
              {query ? `No ${ROLE_LABELS[role]} matchup called "${query}" with enough games this patch.` : 'No matchups yet.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
