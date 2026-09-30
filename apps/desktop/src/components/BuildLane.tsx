import { TRAIT_LABELS, type BuildVariant, type ItemInfo, type Slot, type Swap } from '@hexcards/data';
import { ItemIcon } from './ItemIcon';
import styles from './BuildLane.module.css';

interface Stage {
  label: string;
  slots: Slot[];
}

const STAGES: Stage[] = [
  { label: 'Start', slots: ['start'] },
  { label: 'First back', slots: ['first-back'] },
  { label: 'Core 1', slots: ['core-1'] },
  { label: 'Core 2', slots: ['core-2'] },
  { label: 'Core 3', slots: ['core-3'] },
  { label: 'Boots', slots: ['boots'] },
  { label: 'Late', slots: ['late-4', 'late-5', 'late-6'] },
];

// Start and first back are bought together, so every item there is shown at full size.
const BOUGHT_TOGETHER: Slot[] = ['start', 'first-back'];

const percent = (share: number) => `${Math.round(share * 100)}%`;
const signedPercent = (delta: number) => `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
const stageOf = (slot: Slot) => STAGES.find((s) => s.slots.includes(slot))!;

interface BuildLaneProps {
  version: string;
  variant: BuildVariant;
  items: Map<number, ItemInfo>;
  /** Swaps whose trigger matches this game. They light up and replace their slot. */
  activeSwaps: Swap[];
}

export function BuildLane({ version, variant, items, activeSwaps }: BuildLaneProps) {
  const commonFor = (slot: Slot) => variant.slots.find((s) => s.slot === slot)?.common ?? [];
  const nameOf = (id: number) => items.get(id)?.name ?? `Item ${id}`;
  const swapsByLit = [...variant.swaps].sort((a, b) => Number(activeSwaps.includes(b)) - Number(activeSwaps.includes(a)));

  return (
    <div className={styles.root}>
      <ol className={styles.lane} aria-label="Build order">
        {STAGES.map((stage) => {
          const common = stage.slots.flatMap(commonFor);
          if (common.length === 0) return null;
          const together = stage.slots.some((slot) => BOUGHT_TOGETHER.includes(slot));
          const [main, ...alternatives] = common;
          const swaps = variant.swaps.filter((s) => stage.slots.includes(s.replacesSlot));
          const lit = swaps.find((s) => activeSwaps.includes(s));

          return (
            <li key={stage.label} className={styles.stage}>
              <div className={styles.stageLabel}>{stage.label}</div>

              {together ? (
                <div className={styles.main}>
                  {common.map((c) => (
                    <ItemIcon key={c.itemId} version={version} itemId={c.itemId} item={items.get(c.itemId)} size="lg" details={[`Built in ${percent(c.share)} of games`]} />
                  ))}
                </div>
              ) : lit ? (
                <>
                  <div className={styles.litItem}>
                    <ItemIcon version={version} itemId={lit.itemId} item={items.get(lit.itemId)} size="lg" details={[`Swap ${TRAIT_LABELS[lit.trigger]}`]} />
                  </div>
                  <div className={styles.mainName}>
                    <span>{nameOf(lit.itemId)}</span>
                    <span className={styles.litNote}>Swap {TRAIT_LABELS[lit.trigger]}</span>
                  </div>
                  <div className={styles.replaced}>
                    <ItemIcon version={version} itemId={main!.itemId} item={items.get(main!.itemId)} size="sm" dimmed />
                    <span>Instead of {nameOf(main!.itemId)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.main}>
                    <ItemIcon version={version} itemId={main!.itemId} item={items.get(main!.itemId)} size="lg" details={[`Built in ${percent(main!.share)} of games`]} />
                  </div>
                  <div className={styles.mainName}>
                    <span>{nameOf(main!.itemId)}</span>
                    <span className={styles.share}>{percent(main!.share)} of games</span>
                  </div>
                </>
              )}

              {!together && alternatives.length > 0 && (
                <div className={styles.alternatives}>
                  <span className={styles.caption}>Also built</span>
                  <div className={styles.altRow}>
                    {alternatives.map((c) => (
                      <div key={c.itemId} className={styles.alt}>
                        <ItemIcon version={version} itemId={c.itemId} item={items.get(c.itemId)} size="md" details={[`Built in ${percent(c.share)} of games`]} />
                        <span className={styles.share}>{percent(c.share)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {swaps.length > 0 && !lit && (
                <div className={styles.caption}>
                  {swaps.length === 1 ? '1 swap' : `${swaps.length} swaps`} below
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {swapsByLit.length > 0 && (
        <section className={styles.swaps} aria-label="Swaps">
          {swapsByLit.map((swap) => {
            const active = activeSwaps.includes(swap);
            const stage = stageOf(swap.replacesSlot);
            const replacedId = commonFor(swap.replacesSlot)[0]?.itemId;
            return (
              <article key={`${swap.trigger}-${swap.itemId}`} className={styles.swap} data-active={active || undefined}>
                <div className={styles.swapHead}>
                  <ItemIcon version={version} itemId={swap.itemId} item={items.get(swap.itemId)} size="md" />
                  <div>
                    <div className={styles.swapTrigger}>Swap {TRAIT_LABELS[swap.trigger]}</div>
                    <div className={styles.swapItem}>{nameOf(swap.itemId)}</div>
                  </div>
                </div>
                <p className={styles.swapText}>
                  Replaces {replacedId ? nameOf(replacedId) : 'the item'} in {stage.label}. {swap.timing}.
                </p>
                {swap.earlyComponents.length > 0 && (
                  <div className={styles.components}>
                    <span className={styles.caption}>Buy early</span>
                    {swap.earlyComponents.map((id) => (
                      <ItemIcon key={id} version={version} itemId={id} item={items.get(id)} size="sm" />
                    ))}
                    <span className={styles.caption}>{swap.earlyComponents.map(nameOf).join(', ')}</span>
                  </div>
                )}
                <div className={styles.evidence}>
                  {signedPercent(swap.evidence.winRateDelta)} win rate {TRAIT_LABELS[swap.trigger]} · {swap.evidence.games.toLocaleString()} games
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
