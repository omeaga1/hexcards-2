import { HoverCard } from './arc/hover-card/hover-card';
import type { AbilityInfo, BuildVariant } from '@hexcards/data';
import styles from './SkillOrder.module.css';

interface SkillOrderProps {
  variant: BuildVariant;
  abilities: AbilityInfo[] | null;
}

const ROWS = ['Q', 'W', 'E', 'R'] as const;
const LEVELS = Array.from({ length: 18 }, (_, i) => i + 1);

export function SkillOrder({ variant, abilities }: SkillOrderProps) {
  const ability = (key: string) => abilities?.find((a) => a.key === key);

  return (
    <div className={styles.skills}>
      <div className={styles.max} aria-label={`Max ${variant.skillMaxOrder.join(', then ')}`}>
        {variant.skillMaxOrder.map((key, i) => (
          <span key={key} className={styles.maxStep}>
            {i > 0 && <span className={styles.arrow} aria-hidden>›</span>}
            {ability(key) && <img src={ability(key)!.icon} alt="" />}
            <span className={styles.key}>{key}</span>
          </span>
        ))}
        <span className={styles.caption}>Max order. Take R whenever you can.</span>
      </div>

      <div className={styles.gridScroll}>
        <table className={styles.grid}>
          <caption className={styles.srOnly}>Ability leveled at each champion level</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.srOnly}>Ability</th>
              {LEVELS.map((l) => (
                <th key={l} scope="col" className={styles.level}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((key) => {
              const info = ability(key);
              return (
                <tr key={key}>
                  <th scope="row" className={styles.rowHead}>
                    {info ? (
                      <HoverCard
                        side="right"
                        content={
                          <div className={styles.card}>
                            <div className={styles.cardTitle}>{key}: {info.name}</div>
                            <p className={styles.cardText}>{info.description}</p>
                          </div>
                        }
                      >
                        <span className={styles.ability} tabIndex={0}>
                          <img src={info.icon} alt={info.name} />
                          <span className={styles.key}>{key}</span>
                        </span>
                      </HoverCard>
                    ) : (
                      <span className={styles.key}>{key}</span>
                    )}
                  </th>
                  {LEVELS.map((level) => {
                    const leveled = variant.skillOrder[level - 1] === key;
                    return (
                      <td key={level} className={styles.cell} data-on={leveled || undefined} data-ult={key === 'R' || undefined}>
                        {leveled ? level : ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
