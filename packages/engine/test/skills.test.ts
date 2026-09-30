import { describe, expect, it } from 'vitest';
import { sampleBuilds } from '@hexcards/data';
import { maxOrderOf, validateSkillOrder } from '../src';

const jax = ['E', 'Q', 'W', 'W', 'W', 'R', 'W', 'E', 'W', 'E', 'R', 'E', 'E', 'Q', 'Q', 'R', 'Q', 'Q'] as const;

describe('validateSkillOrder', () => {
  it('accepts a legal order', () => {
    expect(validateSkillOrder(jax)).toEqual([]);
  });

  it('rejects R before level 6', () => {
    const order = [...jax];
    [order[4], order[5]] = [order[5]!, order[4]!];
    expect(validateSkillOrder(order).join(' ')).toMatch(/R rank 1 at level 5/);
  });

  it('rejects a basic ability ranked too early', () => {
    const order = ['W', 'W', ...jax.slice(2)] as typeof jax[number][];
    expect(validateSkillOrder(order).join(' ')).toMatch(/W rank 2 at level 2 needs level 3/);
  });

  it('checks every sample build', () => {
    for (const champion of sampleBuilds) {
      for (const v of champion.variants) {
        expect(validateSkillOrder(v.skillOrder)).toEqual([]);
        expect(maxOrderOf(v.skillOrder)).toEqual(v.skillMaxOrder);
      }
    }
  });
});
