import type { BuildVariant } from '@hexcards/data';

type Ability = BuildVariant['skillOrder'][number];

/**
 * Checks a level-by-level skill order follows League's rules: basic abilities have 5 ranks and
 * rank N needs champion level 2N-1; R has 3 ranks at levels 6, 11 and 16.
 */
export function validateSkillOrder(order: readonly Ability[]): string[] {
  const errors: string[] = [];
  if (order.length !== 18) errors.push(`Expected 18 levels, got ${order.length}.`);
  const ranks: Record<Ability, number> = { Q: 0, W: 0, E: 0, R: 0 };
  order.forEach((ability, i) => {
    const level = i + 1;
    const rank = ++ranks[ability];
    if (ability === 'R') {
      const needed = [6, 11, 16][rank - 1];
      if (needed === undefined) errors.push(`R leveled past rank 3 at level ${level}.`);
      else if (level < needed) errors.push(`R rank ${rank} at level ${level} needs level ${needed}.`);
    } else if (rank > 5) {
      errors.push(`${ability} leveled past rank 5 at level ${level}.`);
    } else if (level < 2 * rank - 1) {
      errors.push(`${ability} rank ${rank} at level ${level} needs level ${2 * rank - 1}.`);
    }
  });
  return errors;
}

/** The order the three basic abilities reach rank 5, e.g. ["W", "E", "Q"]. */
export function maxOrderOf(order: readonly Ability[]): Ability[] {
  const ranks: Record<Ability, number> = { Q: 0, W: 0, E: 0, R: 0 };
  const maxed: Ability[] = [];
  for (const ability of order) {
    if (ability !== 'R' && ++ranks[ability] === 5) maxed.push(ability);
  }
  return maxed;
}
