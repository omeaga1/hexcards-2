import { forwardRef, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { motion, useMotionTemplate, useReducedMotion, useSpring } from 'motion/react';
import styles from './HexCard.module.css';

// Tilt and glare adapted from useLayouts' holographic referral card (MIT, https://uselayouts.com).
const tiltSpring = { stiffness: 260, damping: 28, mass: 0.7 };
/** Degrees the card leans toward the pointer at its edges. */
const MAX_TILT = 12;

export interface HexCardProps {
  /** Tall portrait art filling the card. */
  art: string;
  /** Printed in the hex emblem, e.g. "01". */
  number: string;
  title: string;
  subtitle: string;
  /** Short stamps across the top, e.g. "Most played". */
  stamps?: string[];
  /** Icons along the bottom edge, e.g. the core items. */
  footer?: ReactNode;
  /** Set when the card is one choice in a hand (a radio). Leave unset for a plain showcase card that opens something. */
  selected?: boolean;
  onSelect: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
}

/**
 * A collectible card that leans toward the pointer and catches the light. The selected card is
 * printed in foil; the others show it only while hovered.
 */
export const HexCard = forwardRef<HTMLButtonElement, HexCardProps>(function HexCard(
  { art, number, title, subtitle, stamps = [], footer, selected, onSelect, onKeyDown, tabIndex },
  ref,
) {
  const reduce = useReducedMotion();
  const rotateX = useSpring(0, tiltSpring);
  const rotateY = useSpring(0, tiltSpring);
  const lift = useSpring(0, tiltSpring);
  const transform = useMotionTemplate`perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${lift}px)`;
  const surface = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    // The foil and glare follow the pointer through CSS variables, without re-rendering.
    surface.current?.style.setProperty('--px', `${x * 100}%`);
    surface.current?.style.setProperty('--py', `${y * 100}%`);
    surface.current?.setAttribute('data-lit', '');
    if (reduce) return;
    rotateX.set((0.5 - y) * MAX_TILT * 2);
    rotateY.set((x - 0.5) * MAX_TILT * 2);
    lift.set(24);
  };
  const onPointerLeave = () => {
    surface.current?.removeAttribute('data-lit');
    rotateX.set(0);
    rotateY.set(0);
    lift.set(0);
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      role={selected === undefined ? undefined : 'radio'}
      aria-checked={selected}
      tabIndex={tabIndex}
      className={styles.card}
      data-selected={selected || undefined}
      data-showcase={selected === undefined || undefined}
      style={{ transform: reduce ? undefined : transform }}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      whileTap={reduce ? undefined : { scale: 0.97 }}
    >
      <div ref={surface} className={styles.surface}>
        <img className={styles.art} src={art} alt="" draggable={false} />
        <div className={styles.scrim} aria-hidden />

        <div className={styles.top}>
          <span className={styles.hex} aria-hidden>
            <svg viewBox="0 0 24 24"><path d="M12 1.5 21.1 6.75v10.5L12 22.5 2.9 17.25V6.75Z" /></svg>
            <span>{number}</span>
          </span>
          <span className={styles.stamps}>
            {stamps.map((s) => <span key={s} className={styles.stamp}>{s}</span>)}
          </span>
        </div>

        <div className={styles.bottom}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>{subtitle}</span>
          {footer && <span className={styles.footer}>{footer}</span>}
        </div>

        <div className={styles.foil} aria-hidden />
        <div className={styles.glare} aria-hidden />
      </div>
    </motion.button>
  );
});
