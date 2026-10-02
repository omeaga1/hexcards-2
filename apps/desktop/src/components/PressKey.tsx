import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from './arc/lib/motion-tokens';
import styles from './PressKey.module.css';

// Adapted from useLayouts' tactile button (MIT, https://uselayouts.com): a key that sinks into its socket
// when pressed, with a status light set into the cap.

export type KeyLight = 'off' | 'ready' | 'busy' | 'done' | 'error';

interface PressKeyProps {
  children: ReactNode;
  light: KeyLight;
  disabled?: boolean;
  onPress: () => void;
}

export function PressKey({ children, light, disabled, onPress }: PressKeyProps) {
  const reduce = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const down = pressed && !disabled;

  return (
    <span className={styles.socket} data-disabled={disabled || undefined}>
      <motion.button
        type="button"
        className={styles.cap}
        data-pressed={down || undefined}
        disabled={disabled}
        aria-busy={light === 'busy' || undefined}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setPressed(true)}
        onKeyUp={() => setPressed(false)}
        onClick={onPress}
        animate={reduce ? undefined : { y: down ? 3 : 0, scale: down ? 0.98 : 1 }}
        transition={motionTokens.spring.snappy}
      >
        <span className={styles.led} data-light={light} aria-hidden />
        <span className={styles.label}>{children}</span>
      </motion.button>
    </span>
  );
}
