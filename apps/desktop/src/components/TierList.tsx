import { HoverCard } from './arc/hover-card/hover-card';
import { ROLE_LABELS, championTileUrl, type ChampionInfo, type Role } from '@hexcards/data';
import { MIN_TIER_GAMES, type TierEntry, type TierList as TierListData } from '@hexcards/engine';
import styles from './TierList.module.css';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface TierListProps {
  role: Role;
  list: TierListData;
  champions: Map<number, ChampionInfo>;
  hasBuild: (championId: number) => boolean;
  onSelect: (championId: number) => void;
}

export function TierList({ role, list, champions, hasBuild, onSelect }: TierListProps) {
  const entry = (e: TierEntry) => {
    const c = champions.get(e.championId);
    if (!c) return null;
    return (
      <li key={e.championId}>
        <HoverCard
          content={
            <dl className={styles.card}>
              <div className={styles.cardTitle}>{c.name} {ROLE_LABELS[role]}</div>
              <div><dt>Win rate</dt><dd>{pct(e.winRate)}</dd></div>
              <div><dt>Games</dt><dd>{e.games.toLocaleString()}</dd></div>
              <div><dt>Pick rate</dt><dd>{pct(e.pickRate)}</dd></div>
              <div><dt>Ban rate</dt><dd>{pct(e.banRate)}</dd></div>
            </dl>
          }
        >
          <button type="button" className={styles.entry} data-no-build={!hasBuild(c.id) || undefined} onClick={() => onSelect(e.championId)}>
            <img className={styles.art} src={championTileUrl(c.key)} alt="" loading="lazy" draggable={false} />
            <span className={styles.text}>
              <span className={styles.name}>
                {c.name}
              </span>
              <span className={styles.stats}>
                {pct(e.winRate)} win · {pct(e.pickRate)} pick
              </span>
            </span>
          </button>
        </HoverCard>
      </li>
    );
  };

  const ranked = list.tiers.some((t) => t.entries.length > 0);

  return (
    <div className={styles.list}>
      {ranked ? (
        list.tiers.map(({ tier, entries }) => (
          <section key={tier} className={styles.tier} aria-label={`${tier} tier`}>
            <div className={styles.letter} data-tier={tier}>{tier}</div>
            {entries.length > 0 ? <ul className={styles.entries}>{entries.map(entry)}</ul> : <p className={styles.none}>None this patch</p>}
          </section>
        ))
      ) : (
        <p className={styles.none}>Not enough {ROLE_LABELS[role]} games yet to rank champions.</p>
      )}

      {list.lowSample.length > 0 && (
        <section className={styles.lowSample} aria-labelledby="low-sample-heading">
          <h2 id="low-sample-heading" className={styles.lowTitle}>Too few games to rank</h2>
          <p className={styles.caption}>Seen in {ROLE_LABELS[role]} fewer than {MIN_TIER_GAMES} times.</p>
          <ul className={styles.entries}>{list.lowSample.map(entry)}</ul>
        </section>
      )}
    </div>
  );
}
