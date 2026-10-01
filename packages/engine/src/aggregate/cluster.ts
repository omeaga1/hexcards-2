// Splits a champion's games into 1 to 3 builds by what kind of items were bought.
// k-medoids on item profiles with cosine distance, k chosen by silhouette score.
// Deterministic: the same games always give the same clusters.

export type Vector = number[];

export function cosineDistance(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / Math.sqrt(na * nb);
}

/** Assigns every point to a cluster 0..k-1. */
export function kMedoids(points: Vector[], k: number, maxIterations = 25): number[] {
  const n = points.length;
  if (k <= 1 || n <= k) return points.map(() => 0);
  const dist = (i: number, j: number) => cosineDistance(points[i]!, points[j]!);

  // Start from the most central point, then repeatedly add the point farthest from all medoids so far.
  const totalDistance = (i: number) => points.reduce((sum, _, j) => sum + dist(i, j), 0);
  let first = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = totalDistance(i);
    if (d < best) [best, first] = [d, i];
  }
  const medoids = [first];
  while (medoids.length < k) {
    let far = 0;
    let farDist = -1;
    for (let i = 0; i < n; i++) {
      const d = Math.min(...medoids.map((m) => dist(i, m)));
      if (d > farDist) [farDist, far] = [d, i];
    }
    medoids.push(far);
  }

  let labels = points.map(() => 0);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    labels = points.map((_, i) => {
      let label = 0;
      let d = Infinity;
      medoids.forEach((m, c) => {
        const dm = dist(i, m);
        if (dm < d) [d, label] = [dm, c];
      });
      return label;
    });
    let changed = false;
    for (let c = 0; c < k; c++) {
      const members = labels.flatMap((l, i) => (l === c ? [i] : []));
      if (members.length === 0) continue;
      let bestMember = medoids[c]!;
      let bestCost = Infinity;
      for (const i of members) {
        const cost = members.reduce((sum, j) => sum + dist(i, j), 0);
        if (cost < bestCost) [bestCost, bestMember] = [cost, i];
      }
      if (bestMember !== medoids[c]) {
        medoids[c] = bestMember;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return labels;
}

/** Mean silhouette, -1..1: how much closer points are to their own cluster than to the next one. */
export function silhouette(points: Vector[], labels: number[]): number {
  const k = Math.max(...labels) + 1;
  if (k < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const sums = new Array<number>(k).fill(0);
    const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      sums[labels[j]!]! += cosineDistance(points[i]!, points[j]!);
      counts[labels[j]!]!++;
    }
    const own = labels[i]!;
    if (counts[own] === 0) continue;
    const a = sums[own]! / counts[own]!;
    const b = Math.min(...sums.map((s, c) => (c === own || counts[c] === 0 ? Infinity : s / counts[c]!)));
    total += b === Infinity ? 0 : (b - a) / Math.max(a, b);
  }
  return total / points.length;
}

export interface ClusterOptions {
  maxK?: number;
  /** Each cluster needs at least this share of the games... */
  minShare?: number;
  /** ...and at least this many games. */
  minGames?: number;
  /** Below this silhouette score the split isn't clear enough, so everything is one build. */
  minSilhouette?: number;
}

/** Picks k (1 to maxK) and returns cluster labels. */
export function chooseClusters(points: Vector[], options: ClusterOptions = {}): number[] {
  const { maxK = 3, minShare = 0.12, minGames = 25, minSilhouette = 0.2 } = options;
  let best = points.map(() => 0);
  let bestScore = minSilhouette;
  for (let k = 2; k <= maxK; k++) {
    const labels = kMedoids(points, k);
    const sizes = Array.from({ length: k }, (_, c) => labels.filter((l) => l === c).length);
    if (sizes.some((s) => s < minGames || s / points.length < minShare)) continue;
    const score = silhouette(points, labels);
    if (score > bestScore) [best, bestScore] = [labels, score];
  }
  return best;
}
