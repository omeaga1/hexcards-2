import { traitClause, type BuildVariant, type ItemInfo, type Slot, type Swap } from '@hexcards/data';
import { ItemIcon } from './ItemIcon';
import { PowerSpikes, type Spike } from './PowerSpikes';
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
  { label: 'Late', slots: ['late-4', 'late-5', 'late-6'] },
];

// Start and first back are bought together, so every item there is shown at full size.
const BOUGHT_TOGETHER: Slot[] = ['start', 'first-back'];

/** "Also built" items shown under each stage's main item. */
const MAX_ALTERNATIVES = 3;

const percent = (share: number) => `${Math.round(share * 100)}%`;
const signedPercent = (delta: number) => `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
const BOOTS: Stage = { label: 'Boots', slots: ['boots'] };
const stageOf = (slot: Slot) => [...STAGES, BOOTS].find((s) => s.slots.includes(slot))!;

/**
 * Boots go where players actually finish them: before the first core item that's usually done
 * later than the boots. Without timing data they sit after Core 1, where most builds finish them.
 */
function stagesFor(variant: BuildVariant): Stage[] {
  const mainMinute = (slot: Slot) => variant.slots.find((s) => s.slot === slot)?.common[0]?.avgMinute;
  const bootsMinute = mainMinute('boots');
  const cores = STAGES.filter((s) => s.slots.some((slot) => slot.startsWith('core') || slot.startsWith('late')));
  const after = bootsMinute === undefined
    ? cores[0]
    : [...cores].reverse().find((s) => (mainMinute(s.slots[0]!) ?? Infinity) <= bootsMinute);
  const at = after ? STAGES.indexOf(after) + 1 : STAGES.findIndex((s) => s.label === 'Core 1');
  return [...STAGES.slice(0, at), BOOTS, ...STAGES.slice(at)];
}

interface BuildLaneProps {
  version: string;
  variant: BuildVariant;
  items: Map<number, ItemInfo>;
  /** Swaps whose trigger matches this game. They light up and replace their slot. */
  activeSwaps: Swap[];
}

export function BuildLane({ version, variant, items, activeSwaps }: BuildLaneProps) {
  const commonFor = (slot: Slot) => variant.slots.find((s) => s.slot === slot)?.common ?? [];
  // Items already on the core path; the late column only shows what comes after them.
  const coreMains = new Set(['core-1', 'core-2', 'core-3'].map((s) => commonFor(s as Slot)[0]?.itemId));

  /**
   * A stage's items, most built first, at most one main plus MAX_ALTERNATIVES. The late stage merges
   * slots 4 to 6, keeps each item once at its highest share, and leaves out the core items.
   */
  const stageItems = (stage: Stage) => {
    if (stage.slots.length === 1) {
      const items = commonFor(stage.slots[0]!);
      return BOUGHT_TOGETHER.includes(stage.slots[0]!) ? items : items.slice(0, MAX_ALTERNATIVES + 1);
    }
    const best = new Map<number, ReturnType<typeof commonFor>[number]>();
    for (const c of stage.slots.flatMap(commonFor)) {
      if (coreMains.has(c.itemId)) continue;
      if ((best.get(c.itemId)?.share ?? 0) < c.share) best.set(c.itemId, c);
    }
    return [...best.values()].sort((a, b) => b.share - a.share).slice(0, MAX_ALTERNATIVES + 1);
  };
  const nameOf = (id: number) => items.get(id)?.name ?? `Item ${id}`;
  const stages = stagesFor(variant);
  // Each stage's item on the game clock: the lit swap if there is one, else the usual item. Start
  // and first back are bought before the clock matters.
  const spikes: Spike[] = stages.flatMap((stage) => {
    if (stage.slots.some((slot) => BOUGHT_TOGETHER.includes(slot))) return [];
    const lit = activeSwaps.find((s) => stage.slots.includes(s.replacesSlot));
    if (lit?.minute) return [{ itemId: lit.itemId, minute: lit.minute, stage: stage.label }];
    const main = stageItems(stage)[0];
    return main?.avgMinute ? [{ itemId: main.itemId, minute: main.avgMinute, stage: stage.label }] : [];
  });
  const swapsByLit = [...variant.swaps].sort((a, b) => Number(activeSwaps.includes(b)) - Number(activeSwaps.includes(a)));

  return (
    <div className={styles.root}>
      <ol className={styles.lane} aria-label="Build order">
        {stages.map((stage) => {
          const common = stageItems(stage);
          if (common.length === 0) return null;
          const together = stage.slots.some((slot) => BOUGHT_TOGETHER.includes(slot));
          const [main, ...alternatives] = common;
          const swaps = variant.swaps.filter((s) => stage.slots.includes(s.replacesSlot));
          const lit = swaps.find((s) => activeSwaps.includes(s));
          // The back of the slot's card: the lit swap, or the first one, ready to flip to.
          const flipTo = lit ?? swaps[0];

          return (
            <li key={stage.label} className={styles.stage}>
              <div className={styles.stageLabel}>{stage.label}</div>

              {together ? (
                <div className={styles.main}>
                  {common.map((c) => (
                    <ItemIcon key={c.itemId} version={version} itemId={c.itemId} item={items.get(c.itemId)} size="lg" details={[`Built in ${percent(c.share)} of games`]} />
                  ))}
                </div>
              ) : (
                <>
                  {/* The slot is a two-sided card: the usual item on the front, the swap on the back. It flips when the swap lights up. */}
                  <div className={styles.flip} data-flipped={lit ? '' : undefined}>
                    <div className={styles.face} aria-hidden={!!lit}>
                      <ItemIcon version={version} itemId={main!.itemId} item={items.get(main!.itemId)} size="lg" details={[`Built in ${percent(main!.share)} of games`]} />
                    </div>
                    {flipTo && (
                      <div className={`${styles.face} ${styles.back}`} aria-hidden={!lit}>
                        <div className={styles.litItem}>
                          <ItemIcon version={version} itemId={flipTo.itemId} item={items.get(flipTo.itemId)} size="lg" details={[`Swap ${traitClause(flipTo.trigger)}`]} />
                        </div>
                      </div>
                    )}
                  </div>
                  {lit ? (
                    <>
                      <div className={styles.mainName}>
                        <span>{nameOf(lit.itemId)}</span>
                        <span className={styles.litNote}>Swap {traitClause(lit.trigger)}</span>
                      </div>
                      <div className={styles.replaced}>
                        <ItemIcon version={version} itemId={main!.itemId} item={items.get(main!.itemId)} size="sm" dimmed />
                        <span>Instead of {nameOf(main!.itemId)}</span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.mainName}>
                      <span>{nameOf(main!.itemId)}</span>
                      <span className={styles.share}>
                        {percent(main!.share)} of games{main!.avgMinute ? ` · ~${Math.round(main!.avgMinute)} min` : ''}
                      </span>
                    </div>
                  )}
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

      {spikes.length > 1 && <PowerSpikes version={version} items={items} spikes={spikes} />}

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
                    <div className={styles.swapTrigger}>Swap {traitClause(swap.trigger)}</div>
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
                  {/* Buy rates are measured on every rank's games for this champion and role. */}
                  {swap.evidence.buyRate
                    ? `Bought in ${percent(swap.evidence.buyRate[0])} of games ${traitClause(swap.trigger)}, ${percent(swap.evidence.buyRate[1])} otherwise. ${signedPercent(swap.evidence.winRateDelta)} win rate when bought, ${swap.evidence.games.toLocaleString()} games across all ranks.`
                    : `${signedPercent(swap.evidence.winRateDelta)} win rate ${traitClause(swap.trigger)} · ${swap.evidence.games.toLocaleString()} games`}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
