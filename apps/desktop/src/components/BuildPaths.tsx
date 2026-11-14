import { useRef, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import type { BuildPath, ItemInfo } from '@hexcards/data';
import { ItemIcon } from './ItemIcon';
import styles from './BuildPaths.module.css';

const percent = (x: number) => `${Math.round(x * 100)}%`;
const winPercent = (x: number) => `${(x * 100).toFixed(1)}%`;
/** A path needs this many games before it can be called the best win rate. */
const BEST_MIN_GAMES = 30;

interface BuildPathsProps {
  version: string;
  paths: BuildPath[];
  items: Map<number, ItemInfo>;
  /** Index of the path the lane shows, or null for the most built item in each slot. */
  value: number | null;
  /** True when no path matches the most built item in each slot, so that needs its own choice. */
  offerUsual: boolean;
  onValueChange: (index: number | null) => void;
}

/**
 * The full core paths this build's players take, as a radio group. Picking one puts it in the lane
 * below and in the item set Hex Cards imports.
 */
export function BuildPaths({ version, paths, items, value, offerUsual, onValueChange }: BuildPathsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choices: (number | null)[] = [...(offerUsual ? [null] : []), ...paths.map((_, i) => i)];
  const judged = paths.filter((p) => p.games >= BEST_MIN_GAMES);
  const best = judged.length > 1 ? judged.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : null;
  const nameOf = (id: number) => items.get(id)?.name ?? `Item ${id}`;

  const onKeyDown = (at: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + choices.length) % choices.length;
    onValueChange(choices[next]!);
    refs.current[next]?.focus();
  };

  return (
    <div className={styles.paths} role="radiogroup" aria-label="Core paths">
      {choices.map((choice, at) => {
        const selected = choice === value;
        const common = { ref: (el: HTMLButtonElement | null) => { refs.current[at] = el; }, type: 'button' as const, role: 'radio', 'aria-checked': selected, tabIndex: selected ? 0 : -1, className: styles.path, 'data-selected': selected || undefined, onClick: () => onValueChange(choice), onKeyDown: onKeyDown(at) };
        if (choice === null) {
          return (
            <button key="usual" {...common}>
              <span className={styles.usualTitle}>Most built per slot</span>
              <span className={styles.stats}>Each slot's most common item. Few games buy all three together.</span>
            </button>
          );
        }
        const path = paths[choice]!;
        const marks = [choice === 0 && 'Most played', path === best && 'Best win rate'].filter((m): m is string => !!m);
        return (
          <button key={path.items.join('-')} {...common} aria-label={`${path.items.map(nameOf).join(', then ')}. ${percent(path.share)} of games, ${winPercent(path.winRate)} win rate`}>
            <span className={styles.items}>
              {path.items.map((id, k) => (
                <span key={id} className={styles.step}>
                  {k > 0 && <ChevronRight className={styles.chevron} size={14} aria-hidden />}
                  <ItemIcon version={version} itemId={id} item={items.get(id)} size="md" details={[`Item ${k + 1} on this path`]} />
                </span>
              ))}
            </span>
            <span className={styles.share}>{percent(path.share)}</span>
            <span className={styles.stats}>
              <span data-best={path === best || undefined}>{winPercent(path.winRate)} win</span> · {path.games.toLocaleString()} games
            </span>
            {marks.length > 0 && (
              <span className={styles.marks}>
                {marks.map((m) => <span key={m} className={styles.mark}>{m}</span>)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
