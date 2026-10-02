import { ROLE_LABELS, championIconUrl, traitClause, type ChampionInfo, type Role } from '@hexcards/data';
import type { PickReason, PickSuggestion } from '@hexcards/engine';
import styles from './PickSuggestions.module.css';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface PickSuggestionsProps {
  version: string;
  champions: Map<number, ChampionInfo>;
  role: Role;
  /** The enemy most likely in your lane, guessed from their champions. */
  opponent?: number;
  suggestions: PickSuggestion[];
  /** The champion page that's open, so its suggestion shows as current. */
  selectedId: number | null;
  onSelect: (championId: number) => void;
}

/** Champions that do well in your role against these teams. Picking one opens its builds. */
export function PickSuggestions({ version, champions, role, opponent, suggestions, selectedId, onSelect }: PickSuggestionsProps) {
  const name = (id: number) => champions.get(id)?.name ?? 'your lane opponent';
  const why = (reason: PickReason) => {
    if (reason.kind === 'lane') return `${pct(reason.winRate)} into ${name(reason.opponent)}, ${reason.games.toLocaleString()} games`;
    if (reason.kind === 'trait') return `${pct(reason.winRate)} ${traitClause(reason.trait)}, ${reason.games.toLocaleString()} games`;
    return `${pct(reason.winRate)} win rate in ${ROLE_LABELS[role]}, ${reason.games.toLocaleString()} games`;
  };

  return (
    <div className={styles.picks}>
      <p className={styles.title}>
        Picks for {ROLE_LABELS[role]}
        <span className={styles.caption}>
          {opponent === undefined ? 'From win rates in your role and both teams so far' : `Against ${name(opponent)} (likely your lane) and both teams so far`}
        </span>
      </p>
      <ul className={styles.list}>
        {suggestions.map((s) => {
          const c = champions.get(s.championId);
          if (!c) return null;
          return (
            <li key={s.championId}>
              <button type="button" className={styles.pick} aria-pressed={selectedId === s.championId} onClick={() => onSelect(s.championId)}>
                <img src={championIconUrl(version, c.key)} alt="" draggable={false} />
                <span className={styles.text}>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.reason}>{why(s.reason)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
