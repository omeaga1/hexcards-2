import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { ROLE_LABELS, roleIconUrl, type Role } from '@hexcards/data';
import { motionTokens } from './arc/lib/motion-tokens';
import styles from './RolePills.module.css';

// Adapted from useLayouts' discrete tabs (MIT, https://uselayouts.com): the chosen pill opens to show its name.

/** Matches --radius-pill: any radius past half the height reads as a full pill. */
const PILL_RADIUS = 9999;

interface RolePillsProps {
  roles: Role[];
  value: Role;
  onValueChange: (role: Role) => void;
}

export function RolePills({ roles, value, onValueChange }: RolePillsProps) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : motionTokens.spring.morph;
  return (
    <LayoutGroup>
      <div className={styles.pills} role="radiogroup" aria-label="Role">
        {roles.map((r) => {
          const active = r === value;
          return (
            <motion.button
              key={r}
              layout
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={ROLE_LABELS[r]}
              title={ROLE_LABELS[r]}
              className={styles.pill}
              data-active={active || undefined}
              transition={{ layout: spring }}
              // Motion needs the radius inline, as a number, to keep corners round while the pill resizes.
              style={{ borderRadius: PILL_RADIUS }}
              onClick={() => onValueChange(r)}
              whileTap={reduce ? undefined : { scale: 0.97 }}
            >
              <motion.img layout="position" transition={{ layout: spring }} src={roleIconUrl(r)} alt="" draggable={false} />
              {active && (
                <motion.span
                  layout="position"
                  className={styles.label}
                  initial={reduce ? false : { opacity: 0, filter: `blur(${motionTokens.blur.soft}px)` }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  transition={{ duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}
                >
                  {ROLE_LABELS[r]}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
