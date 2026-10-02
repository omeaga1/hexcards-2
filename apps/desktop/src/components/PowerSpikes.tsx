import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ItemInfo } from '@hexcards/data';
import { ItemIcon } from './ItemIcon';
import styles from './PowerSpikes.module.css';

export interface Spike {
  itemId: number;
  /** Average game minute players finish it. */
  minute: number;
  /** The build stage it belongs to, e.g. "Core 2". */
  stage: string;
}

interface PowerSpikesProps {
  version: string;
  items: Map<number, ItemInfo>;
  spikes: Spike[];
}

/** Item icons are this wide (the md ItemIcon, --space-8); markers closer than this stack instead of overlapping. */
const ICON = 32;
const GAP = 6;
const TICK_MINUTES = 5;
/** Tick labels closer than this (px) would collide, so narrow tracks label every 10 minutes instead. */
const MIN_TICK_SPACING = 44;

/**
 * The build on a game clock: each core item sits at the minute players usually finish it, so the gaps
 * between power spikes are visible, not just the order.
 */
export function PowerSpikes({ version, items, spikes }: PowerSpikesProps) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const sorted = [...spikes].sort((a, b) => a.minute - b.minute);
  const end = Math.max(25, Math.ceil(((sorted.at(-1)?.minute ?? 0) + 1) / TICK_MINUTES) * TICK_MINUTES);
  const step = width > 0 && (width * TICK_MINUTES) / end < MIN_TICK_SPACING ? TICK_MINUTES * 2 : TICK_MINUTES;
  const ticks = Array.from({ length: Math.floor(end / step) + 1 }, (_, i) => i * step);
  const x = (minute: number) => (minute / end) * width;

  // Lay markers out left to right; one that would overlap the last marker in a row moves up a row.
  const rowEnds: number[] = [];
  const placed = sorted.map((s) => {
    const left = Math.min(Math.max(x(s.minute) - ICON / 2, 0), Math.max(width - ICON, 0));
    let row = rowEnds.findIndex((rightEdge) => left >= rightEdge + GAP);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = left + ICON;
    return { ...s, left, row };
  });
  const rows = Math.max(rowEnds.length, 1);

  return (
    <figure className={styles.spikes} aria-label="Power spikes: the minute each item is usually finished">
      <figcaption className={styles.head}>
        <span className={styles.title}>Power spikes</span>
        <span className={styles.caption}>Game minute each item is usually finished</span>
      </figcaption>
      <div ref={track} className={styles.track} style={{ '--rows': rows } as CSSProperties}>
        {width > 0 && placed.map((s) => (
          <div
            key={`${s.stage}-${s.itemId}`}
            className={styles.marker}
            style={{ '--left': `${s.left}px`, '--row': s.row, '--stem-x': `${x(s.minute) - s.left}px` } as CSSProperties}
          >
            <ItemIcon
              version={version}
              itemId={s.itemId}
              item={items.get(s.itemId)}
              size="md"
              details={[`${s.stage}, finished around minute ${Math.round(s.minute)}`]}
            />
          </div>
        ))}
        <div className={styles.axis} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className={styles.tick} data-edge={t === 0 ? 'start' : t === end ? 'end' : undefined} style={{ '--at': `${(t / end) * 100}%` } as CSSProperties}>
              {t}
            </span>
          ))}
          {width > 0 && placed.map((s) => (
            <span key={`dot-${s.stage}-${s.itemId}`} className={styles.dot} style={{ '--at': `${(s.minute / end) * 100}%` } as CSSProperties} />
          ))}
        </div>
      </div>
    </figure>
  );
}
