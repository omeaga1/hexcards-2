import { useRef, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { championLoadingUrl, itemIconUrl, type BuildVariant, type ChampionInfo, type ItemInfo } from '@hexcards/data';
import { motionTokens } from './arc/lib/motion-tokens';
import { HexCard } from './HexCard';
import styles from './BuildDeck.module.css';

const percent = (share: number) => `${Math.round(share * 100)}%`;
/** Degrees each card leans away from the middle of the hand. */
const FAN = 2.5;

interface BuildDeckProps {
  version: string;
  champion: ChampionInfo;
  variants: BuildVariant[];
  items: Map<number, ItemInfo>;
  value: string;
  /** The build that fits this game's teams best, if there are teams to go on. */
  recommendedId?: string;
  onValueChange: (id: string) => void;
}

/** The champion's builds dealt as a hand of Hex Cards. Pick one to see its runes, skills and items. */
export function BuildDeck({ version, champion, variants, items, value, recommendedId, onValueChange }: BuildDeckProps) {
  const reduce = useReducedMotion();
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const mostPlayed = variants.length > 1 ? maxBy(variants, (v) => v.stats.pickShare) : null;
  const bestWin = variants.length > 1 ? maxBy(variants, (v) => v.stats.winRate) : null;
  const middle = (variants.length - 1) / 2;

  // Arrow keys move through the hand like a radio group.
  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + variants.length) % variants.length;
    onValueChange(variants[next]!.id);
    cards.current[next]?.focus();
  };

  return (
    <div className={styles.deck} role="radiogroup" aria-label="Builds">
      {variants.map((v, i) => {
        const selected = v.id === value;
        // Two stamps fit on a card; fitting this game matters more than overall win rate.
        const stamps = [v.id === recommendedId && 'Best for this game', v === mostPlayed && 'Most played', v === bestWin && 'Best win rate']
          .filter((s): s is string => !!s)
          .slice(0, 2);
        const core = (['core-1', 'core-2', 'core-3'] as const).flatMap((slot) => v.slots.find((s) => s.slot === slot)?.common[0]?.itemId ?? []);
        const fan = (i - middle) * FAN;
        return (
          <motion.div
            key={v.id}
            className={styles.slot}
            initial={reduce ? false : { opacity: 0, y: 64, rotate: -fan * 4, scale: 0.9 }}
            animate={{ opacity: 1, y: selected ? -10 : 0, rotate: reduce ? 0 : fan, scale: 1 }}
            transition={reduce ? { duration: 0 } : { ...motionTokens.spring.morph, delay: i * 0.07 }}
          >
            <HexCard
              ref={(el) => { cards.current[i] = el; }}
              art={championLoadingUrl(champion.key)}
              number={String(i + 1).padStart(2, '0')}
              // The page is already about this champion, so "Caitlyn Crit: The Collector" reads "Crit: The Collector".
              title={v.label.startsWith(`${champion.name} `) ? v.label.slice(champion.name.length + 1) : v.label}
              subtitle={`${(v.stats.winRate * 100).toFixed(1)}% win · ${percent(v.stats.pickShare)} of ${v.stats.games.toLocaleString()} games`}
              stamps={stamps}
              footer={core.map((id, k) => (
                <img key={`${k}-${id}`} className={styles.item} src={itemIconUrl(version, id)} alt={items.get(id)?.name ?? `Item ${id}`} title={items.get(id)?.name} draggable={false} />
              ))}
              selected={selected}
              onSelect={() => onValueChange(v.id)}
              onKeyDown={onKeyDown(i)}
              tabIndex={selected ? 0 : -1}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

function maxBy<T>(list: T[], score: (t: T) => number): T | null {
  return list.reduce<T | null>((best, t) => (best === null || score(t) > score(best) ? t : best), null);
}
