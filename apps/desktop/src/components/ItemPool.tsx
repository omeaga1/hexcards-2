import { useMemo, useState } from 'react';
import { TRAIT_LABELS, type ItemInfo, type ItemOption, type Trait } from '@hexcards/data';
import { Button } from './arc/button/button';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { ItemIcon } from './ItemIcon';
import styles from './ItemPool.module.css';

const percent = (x: number) => `${Math.round(x * 100)}%`;
const winPercent = (x: number) => `${(x * 100).toFixed(1)}%`;
const points = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}`;
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
/** Under this many games, a win rate is shown but not called good or bad. */
const JUDGE_MIN_GAMES = 50;
/** Smaller gaps than this read as even. */
const EVEN = 0.01;
/** "Best win rate" pulls small samples toward even, as if each item had this many extra even games. */
const PRIOR_GAMES = 100;
const FIRST_SHOWN = 12;

type Sort = 'built' | 'win';

interface ItemPoolProps {
  version: string;
  options: ItemOption[];
  items: Map<number, ItemInfo>;
  /** Items on the core path the lane shows. */
  pathItems: Set<number>;
  /** Team traits in this game (or toggled on). Items bought against one light up. */
  traits: Set<Trait>;
}

/**
 * Every finished item this build's players buy often enough to judge, not just the few in the lane:
 * how often it's built, when, its win rate against games of the same length, and what it's bought against.
 */
export function ItemPool({ version, options, items, pathItems, traits }: ItemPoolProps) {
  const [sort, setSort] = useState<Sort>('built');
  const [filter, setFilter] = useState<Trait | null>(null);
  const [showAll, setShowAll] = useState(false);
  const counters = useMemo(() => [...new Set(options.flatMap((o) => o.goodVs))], [options]);
  const fits = (o: ItemOption) => o.goodVs.some((t) => traits.has(t));

  const listed = useMemo(() => {
    const score = (o: ItemOption) => (sort === 'built' ? o.games : (o.winRateDelta * o.games) / (o.games + PRIOR_GAMES));
    return options
      .filter((o) => !filter || o.goodVs.includes(filter))
      .sort((a, b) => score(b) - score(a));
  }, [options, sort, filter]);
  const shown = showAll ? listed : listed.slice(0, FIRST_SHOWN);
  const nameOf = (id: number) => items.get(id)?.name ?? `Item ${id}`;

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <SegmentedControl
          label="Sort items"
          options={[{ value: 'built', label: 'Most built' }, { value: 'win', label: 'Best win rate' }]}
          value={sort}
          onValueChange={(v) => setSort(v as Sort)}
        />
        {counters.length > 0 && (
          <div className={styles.filters} role="group" aria-label="Show items bought against">
            <button type="button" className={styles.chip} aria-pressed={filter === null} onClick={() => setFilter(null)}>All</button>
            {counters.map((t) => (
              <button key={t} type="button" className={styles.chip} aria-pressed={filter === t} onClick={() => setFilter(filter === t ? null : t)}>
                {TRAIT_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className={styles.grid} aria-label="Items">
        {shown.map((o) => {
          const judged = o.games >= JUDGE_MIN_GAMES && Math.abs(o.winRateDelta) >= EVEN;
          const tone = !judged ? 'even' : o.winRateDelta > 0 ? 'up' : 'down';
          return (
            <li key={o.itemId} className={styles.item} data-fits={fits(o) || undefined}>
              <ItemIcon
                version={version}
                itemId={o.itemId}
                item={items.get(o.itemId)}
                size="md"
                details={[`Built in ${percent(o.share)} of games (${o.games.toLocaleString()})`, `${winPercent(o.winRate)} win rate`]}
              />
              <div className={styles.body}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{nameOf(o.itemId)}</span>
                  {pathItems.has(o.itemId) && <span className={styles.tag}>On your path</span>}
                </div>
                <div className={styles.meta}>
                  Usually {ORDINAL[o.position - 1]} item · ~{Math.round(o.avgMinute)} min
                </div>
                {o.goodVs.length > 0 && (
                  <div className={styles.counters}>
                    {o.goodVs.map((t) => (
                      <span key={t} className={styles.counter} data-on={traits.has(t) || undefined}>{TRAIT_LABELS[t]}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.figures}>
                <span className={styles.built}><strong>{percent(o.share)}</strong> built</span>
                <span className={styles.win} data-tone={tone} title={`${winPercent(o.winRate)} win rate in ${o.games.toLocaleString()} games; ${points(o.winRateDelta)} points against games that finished an item at the same point`}>
                  {winPercent(o.winRate)} win
                  <span className={styles.delta}>{judged ? points(o.winRateDelta) : o.games < JUDGE_MIN_GAMES ? 'few games' : 'even'}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <p className={styles.note}>
          Built is the share of this build's games that bought the item. Win rate is set against games that finished an item at the same point, so late items aren't marked down for long games.
        </p>
        {listed.length > FIRST_SHOWN && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${listed.length} items`}
          </Button>
        )}
      </div>
    </div>
  );
}
