import { HoverCard } from './arc/hover-card/hover-card';
import type { RuneData, RunePage as RunePageData } from '@hexcards/data';
import styles from './RunePage.module.css';

interface RunePageProps {
  page: RunePageData;
  runes: RuneData;
}

export function RunePage({ page, runes }: RunePageProps) {
  const [keystone, p1, p2, p3, s1, s2, ...shards] = page.perkIds;
  const primary = runes.styles.get(page.primaryStyleId);
  const secondary = runes.styles.get(page.subStyleId);

  const rune = (id: number | undefined, size: 'keystone' | 'minor' | 'shard') => {
    const info = id === undefined ? undefined : runes.perks.get(id);
    if (!info) return null;
    return (
      <HoverCard
        key={`${size}-${id}`}
        content={
          <div className={styles.card}>
            <div className={styles.cardTitle}>{info.name}</div>
            {info.summary && <p className={styles.cardText}>{info.summary}</p>}
          </div>
        }
      >
        <div className={styles.rune} data-size={size} tabIndex={0}>
          <img src={info.icon} alt={info.name} draggable={false} />
          {size !== 'shard' && <span>{info.name}</span>}
        </div>
      </HoverCard>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.tree}>
        <div className={styles.treeName}>
          {primary && <img src={primary.icon} alt="" />}
          {primary?.name ?? 'Primary'}
        </div>
        {rune(keystone, 'keystone')}
        <div className={styles.minors}>{[p1, p2, p3].map((id) => rune(id, 'minor'))}</div>
      </div>

      <div className={styles.tree}>
        <div className={styles.treeName}>
          {secondary && <img src={secondary.icon} alt="" />}
          {secondary?.name ?? 'Secondary'}
        </div>
        <div className={styles.minors}>{[s1, s2].map((id) => rune(id, 'minor'))}</div>
        <div className={styles.shards}>
          <span className={styles.caption}>Shards</span>
          {shards.map((id, i) => (
            <span key={i}>{rune(id, 'shard')}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
