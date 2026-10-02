import { HoverCard } from './arc/hover-card/hover-card';
import type { RuneData, RunePage as RunePageData, RuneStyle } from '@hexcards/data';
import styles from './RunePage.module.css';

interface RunePageProps {
  page: RunePageData;
  runes: RuneData;
}

type Size = 'keystone' | 'minor' | 'shard';

/**
 * The full rune page the way the client lays it out: every option in each row, with the ones this
 * build takes lit and the rest dimmed, so it reads at a glance and matches what you'll see after import.
 */
export function RunePage({ page, runes }: RunePageProps) {
  const [keystone, p1, p2, p3, s1, s2, ...shards] = page.perkIds;
  const primary = runes.styles.get(page.primaryStyleId);
  const secondary = runes.styles.get(page.subStyleId);
  const name = (id: number | undefined) => (id === undefined ? undefined : runes.perks.get(id)?.name);

  // Without the client's tree layout (older data), fall back to just the picked runes, one per row.
  const primaryRows = primary?.rows.length ? primary.rows : [[keystone!], [p1!], [p2!], [p3!]];
  const secondaryRows = secondary?.rows.length ? secondary.rows.slice(1) : [[s1!], [s2!]];
  const shardRows = (primary ?? secondary)?.shardRows.length ? (primary ?? secondary)!.shardRows : shards.map((id) => [id!]);

  const rune = (id: number, size: Size, chosen: boolean) => {
    const info = runes.perks.get(id);
    if (!info) return null;
    return (
      <li key={id}>
        <HoverCard
          content={
            <div className={styles.card}>
              <div className={styles.cardTitle}>{info.name}</div>
              {info.summary && <p className={styles.cardText}>{info.summary}</p>}
            </div>
          }
        >
          {/* Only the picked runes take focus; the rest are there to compare against on hover. */}
          <span className={styles.rune} data-size={size} data-chosen={chosen || undefined} tabIndex={chosen ? 0 : -1}>
            <img src={info.icon} alt={chosen ? info.name : ''} draggable={false} />
          </span>
        </HoverCard>
      </li>
    );
  };

  /** One row of options. Its pick is named beside it; a secondary row may have none. */
  const row = (ids: number[], size: Size, pick: number | undefined, label: string) => (
    <div key={label} className={styles.row} data-size={size}>
      <ul className={styles.options} aria-label={label}>
        {ids.map((id) => rune(id, size, id === pick))}
      </ul>
      <span className={styles.pickName}>{name(pick)}</span>
    </div>
  );

  const header = (style: RuneStyle | undefined, fallback: string) => (
    <div className={styles.treeName}>
      {style && <img src={style.icon} alt="" />}
      {style?.name ?? fallback}
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.tree}>
        {header(primary, 'Primary')}
        {row(primaryRows[0] ?? [], 'keystone', keystone, 'Keystone')}
        {primaryRows.slice(1).map((ids, i) => row(ids, 'minor', [p1, p2, p3].find((id) => id !== undefined && ids.includes(id)), `Primary row ${i + 1}`))}
      </div>

      <div className={styles.tree}>
        {header(secondary, 'Secondary')}
        {secondaryRows.map((ids, i) => row(ids, 'minor', [s1, s2].find((id) => id !== undefined && ids.includes(id)), `Secondary row ${i + 1}`))}
        <div className={styles.shards}>
          <span className={styles.caption}>Shards</span>
          {/* The same shard can sit in two rows, so each row's pick is matched by position, not by ID. */}
          {shardRows.map((ids, i) => row(ids, 'shard', shards[i], ['Offense shard', 'Flex shard', 'Defense shard'][i] ?? `Shard ${i + 1}`))}
        </div>
      </div>
    </div>
  );
}
