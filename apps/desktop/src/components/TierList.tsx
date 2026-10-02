import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { motionTokens } from './arc/lib/motion-tokens';
import { HoverCard } from './arc/hover-card/hover-card';
import { BRACKET_LABELS, ROLE_LABELS, championTileUrl, type Bracket, type ChampionInfo, type Role, type RoleTable } from '@hexcards/data';
import { MIN_TIER_GAMES, type Tier, type TierEntry, type TierList as TierListData } from '@hexcards/engine';
import { roleTierList } from '../tiers';
import styles from './TierList.module.css';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface TierListProps {
  role: Role;
  list: TierListData;
  /** Every loaded bracket's role data, for the champion's tier at each rank. */
  rolesByBracket: { bracket: Bracket; roles: RoleTable }[];
  champions: Map<number, ChampionInfo>;
  hasBuild: (championId: number) => boolean;
  onSelect: (championId: number) => void;
}

export function TierList({ role, list, rolesByBracket, champions, hasBuild, onSelect }: TierListProps) {
  const reduce = useReducedMotion();
  // Champion → tier, per bracket, for the hover card's "by rank" rows.
  const tiersByBracket = useMemo(
    () => rolesByBracket.map(({ bracket, roles }) => ({
      bracket,
      tiers: new Map(roleTierList(roles, role).tiers.flatMap(({ tier, entries }) => entries.map((e) => [e.championId, tier] as const))),
    })),
    [rolesByBracket, role],
  );

  const entry = (e: TierEntry, tier?: Tier) => {
    const c = champions.get(e.championId);
    if (!c) return null;
    return (
      // Switching rank re-sorts the list: each champion glides from its old tier to its new one,
      // so you can see who rises and falls. Keyed by role so changing role doesn't fly champions across.
      <motion.li key={e.championId} layoutId={`${role}-${e.championId}`} layout="position" transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
        <HoverCard
          content={
            <dl className={styles.card}>
              <div className={styles.cardTitle}>{c.name} {ROLE_LABELS[role]}</div>
              <div><dt>Win rate</dt><dd>{pct(e.winRate)}</dd></div>
              <div><dt>Games</dt><dd>{e.games.toLocaleString()}</dd></div>
              <div><dt>Pick rate</dt><dd>{pct(e.pickRate)}</dd></div>
              <div><dt>Ban rate</dt><dd>{pct(e.banRate)}</dd></div>
              {tiersByBracket.length > 1 && (
                <div className={styles.byRank}>
                  <dt>By rank</dt>
                  <dd>
                    {tiersByBracket.map(({ bracket, tiers }) => (
                      <span key={bracket} className={styles.rankTier}>
                        {BRACKET_LABELS[bracket]} <span className={styles.rankLetter} data-tier={tiers.get(e.championId)}>{tiers.get(e.championId) ?? 'Unranked'}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          }
        >
          <button type="button" className={styles.entry} data-tier={tier} data-no-build={!hasBuild(c.id) || undefined} onClick={() => onSelect(e.championId)}>
            <span className={styles.artWrap}>
              <img className={styles.art} src={championTileUrl(c.key)} alt="" loading="lazy" draggable={false} />
            </span>
            <span className={styles.text}>
              <span className={styles.name}>
                {c.name}
              </span>
              <span className={styles.stats}>
                {pct(e.winRate)} win · {pct(e.pickRate)} pick
              </span>
            </span>
          </button>
        </HoverCard>
      </motion.li>
    );
  };

  const ranked = list.tiers.some((t) => t.entries.length > 0);

  return (
    <div className={styles.list}>
      {ranked ? (
        list.tiers.map(({ tier, entries }) => (
          <section key={tier} className={styles.tier} aria-label={`${tier} tier`}>
            <div className={styles.letter} data-tier={tier}><span>{tier}</span></div>
            {entries.length > 0 ? <ul className={styles.entries}>{entries.map((e) => entry(e, tier))}</ul> : <p className={styles.none}>None this patch</p>}
          </section>
        ))
      ) : (
        <p className={styles.none}>Not enough {ROLE_LABELS[role]} games yet to rank champions.</p>
      )}

      {list.lowSample.length > 0 && (
        <section className={styles.lowSample} aria-labelledby="low-sample-heading">
          <h2 id="low-sample-heading" className={styles.lowTitle}>Too few games to rank</h2>
          <p className={styles.caption}>Seen in {ROLE_LABELS[role]} fewer than {MIN_TIER_GAMES} times.</p>
          <ul className={styles.entries}>{list.lowSample.map((e) => entry(e))}</ul>
        </section>
      )}
    </div>
  );
}
