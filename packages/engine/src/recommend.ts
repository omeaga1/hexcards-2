// Which of a champion's builds fits this game: deterministic math from each build's win rate with
// the team traits in play. No model guesses; the same teams always give the same answer.

import type { BuildVariant, Trait } from '@hexcards/data';

/** Imaginary 50% games each build's win rate is pulled toward, like the tier list. */
const BASE_PRIOR = 100;
/**
 * Imaginary games of "no difference" each trait effect is weighed against, so a handful of games
 * can't swing it: 100 real games count for a quarter of their effect, 300 for half.
 */
const TRAIT_PRIOR = 300;
/** Another build must beat the most played one by this much to be recommended over it. */
export const MIN_EDGE = 0.01;

export interface TraitEffect {
  trait: Trait;
  /**
   * How much more this build wins with the trait than its own average, beyond what the trait does
   * to the champion as a whole; weighed down when there are few games.
   */
  delta: number;
  games: number;
}

export interface BuildScore {
  id: string;
  /** The build's own win rate, pulled toward 50% by BASE_PRIOR games. */
  base: number;
  /** Base plus the average trait effect. Only the differences between builds mean anything. */
  score: number;
  effects: TraitEffect[];
}

export interface BuildRecommendation {
  id: string;
  /** Every build's score, in the order given. */
  scores: BuildScore[];
  /** How far the recommended build's score is ahead of the next best. */
  edge: number;
  /** The build it would pick from overall records alone, with no traits in play. */
  baselineId: string;
}

/**
 * The build to play given the traits of both teams, or null when there's nothing to choose
 * (one build, no traits, or builds published before trait stats existed).
 *
 * A build is preferred for what it does differently with these traits: a team with no frontline
 * lowers every build's win rate, so only how much more or less it lowers this build counts. The
 * effects are averaged, not added, because one build's games show up under every trait in play,
 * and a lucky handful would otherwise count once per trait. The most played build keeps the spot
 * unless another beats it by MIN_EDGE.
 */
export function recommendBuild(variants: BuildVariant[], traits: Set<Trait>): BuildRecommendation | null {
  if (variants.length < 2 || traits.size === 0 || variants.some((v) => !v.traitStats)) return null;
  const sum = (f: (v: BuildVariant) => number) => variants.reduce((total, v) => total + f(v), 0);
  const championRate = sum((v) => v.stats.winRate * v.stats.games) / sum((v) => v.stats.games);
  /** What a trait does to the champion's win rate, across all its builds. */
  const championShift = (trait: Trait) => {
    const games = sum((v) => v.traitStats?.[trait]?.[0] ?? 0);
    return games ? sum((v) => v.traitStats?.[trait]?.[1] ?? 0) / games - championRate : 0;
  };

  const scores = variants.map((v): BuildScore => {
    const base = (v.stats.winRate * v.stats.games + BASE_PRIOR * 0.5) / (v.stats.games + BASE_PRIOR);
    const effects = [...traits].flatMap((trait): TraitEffect[] => {
      const [games, wins] = v.traitStats?.[trait] ?? [0, 0];
      if (games === 0) return [];
      const difference = wins / games - v.stats.winRate - championShift(trait);
      return [{ trait, delta: (difference * games) / (games + TRAIT_PRIOR), games }];
    });
    const average = effects.length ? effects.reduce((s, e) => s + e.delta, 0) / effects.length : 0;
    return { id: v.id, base, score: base + average, effects };
  });

  const choose = (by: (s: BuildScore) => number) => {
    const mostPlayed = variants.reduce((a, b) => (b.stats.games > a.stats.games ? b : a));
    const fallback = scores.find((s) => s.id === mostPlayed.id)!;
    const best = scores.reduce((a, b) => (by(b) > by(a) ? b : a));
    return by(best) - by(fallback) >= MIN_EDGE ? best : fallback;
  };
  const pick = choose((s) => s.score);
  const runnerUp = scores.filter((s) => s !== pick).reduce((a, b) => (b.score > a.score ? b : a));
  return { id: pick.id, scores, edge: pick.score - runnerUp.score, baselineId: choose((s) => s.base).id };
}

/**
 * The traits that, on their own, change which build is recommended. Only these (and traits with a
 * swap) are worth a toggle: any other one would do nothing you can see.
 */
export function buildChangingTraits(variants: BuildVariant[]): Trait[] {
  const traits = [...new Set(variants.flatMap((v) => Object.keys(v.traitStats ?? {}) as Trait[]))];
  return traits.filter((trait) => {
    const rec = recommendBuild(variants, new Set([trait]));
    return !!rec && rec.id !== rec.baselineId;
  });
}
