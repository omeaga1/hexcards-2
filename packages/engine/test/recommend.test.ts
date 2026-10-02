import { describe, expect, it } from 'vitest';
import { sampleJaxTop, type BuildVariant, type Trait } from '@hexcards/data';
import { MIN_EDGE, buildChangingTraits, recommendBuild } from '../src';

const [bruiser, onHit] = sampleJaxTop.variants as [BuildVariant, BuildVariant];
// Bruiser: most played, 51% overall, does badly vs mostly AP. On-hit: 50.5% overall, great vs mostly AP.
const variants: BuildVariant[] = [
  { ...bruiser, stats: { games: 2000, pickShare: 0.7, winRate: 0.51 }, traitStats: { 'enemy-mostly-ap': [500, 235], 'enemy-heavy-healing': [900, 459] } },
  { ...onHit, stats: { games: 900, pickShare: 0.3, winRate: 0.505 }, traitStats: { 'enemy-mostly-ap': [300, 168], 'enemy-heavy-healing': [400, 202] } },
];
const traits = (...t: Trait[]) => new Set<Trait>(t);

describe('recommendBuild', () => {
  it('keeps the most played build when the teams give no reason to change', () => {
    expect(recommendBuild(variants, traits('enemy-heavy-healing'))!.id).toBe('bruiser');
  });

  it('switches to the build that does better against this team', () => {
    const rec = recommendBuild(variants, traits('enemy-mostly-ap'))!;
    expect(rec.id).toBe('on-hit');
    const [b, o] = rec.scores;
    expect(o!.score - b!.score).toBeGreaterThanOrEqual(MIN_EDGE);
    expect(rec.edge).toBeCloseTo(o!.score - b!.score);
    expect(o!.effects[0]).toMatchObject({ trait: 'enemy-mostly-ap', games: 300 });
    expect(o!.effects[0]!.delta).toBeGreaterThan(0);
    expect(b!.effects[0]!.delta).toBeLessThan(0);
  });

  it('does not let a handful of games swing it', () => {
    const tiny: BuildVariant[] = [
      { ...variants[0]!, traitStats: { 'enemy-mostly-ap': [500, 255] } },
      { ...variants[1]!, traitStats: { 'enemy-mostly-ap': [5, 5] } },
    ];
    expect(recommendBuild(tiny, traits('enemy-mostly-ap'))!.id).toBe('bruiser');
  });

  it('does not favor a small build just because it has too few games to show a trait that hurts every build', () => {
    // Both builds lose about 4 points with no frontline; the small one only has 40 games to show it.
    const builds: BuildVariant[] = [
      { ...variants[0]!, stats: { games: 2000, pickShare: 0.95, winRate: 0.51 }, traitStats: { 'ally-no-frontline': [800, 376] } },
      { ...variants[1]!, stats: { games: 100, pickShare: 0.05, winRate: 0.52 }, traitStats: { 'ally-no-frontline': [40, 19] } },
    ];
    expect(recommendBuild(builds, traits('ally-no-frontline'))!.id).toBe('bruiser');
  });

  it("does not count a small build's lucky games once for every trait in play", () => {
    // The small build won more of its 60 games across the board; every trait sees the same luck.
    const builds: BuildVariant[] = [
      { ...variants[0]!, stats: { games: 450, pickShare: 0.88, winRate: 0.536 }, traitStats: { 'enemy-mostly-ap': [105, 44], 'enemy-shields': [188, 85], 'ally-no-frontline': [338, 186] } },
      { ...variants[1]!, stats: { games: 63, pickShare: 0.12, winRate: 0.556 }, traitStats: { 'enemy-mostly-ap': [13, 9], 'enemy-shields': [24, 14], 'ally-no-frontline': [51, 30] } },
    ];
    expect(recommendBuild(builds, traits('enemy-mostly-ap', 'enemy-shields', 'ally-no-frontline'))!.id).toBe('bruiser');
  });

  it('has nothing to say with one build, no traits, or older files without trait stats', () => {
    expect(recommendBuild([variants[0]!], traits('enemy-mostly-ap'))).toBeNull();
    expect(recommendBuild(variants, traits())).toBeNull();
    expect(recommendBuild([bruiser, onHit], traits('enemy-mostly-ap'))).toBeNull();
  });

  it('lists only the traits that change the recommended build on their own', () => {
    expect(buildChangingTraits(variants)).toEqual(['enemy-mostly-ap']);
    expect(recommendBuild(variants, traits('enemy-mostly-ap'))!.baselineId).toBe('bruiser');
  });
});
