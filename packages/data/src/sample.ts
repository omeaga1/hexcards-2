// Sample data in the published shape, used by tests and the app until the pipeline (phase 2) produces real builds.
// Item and rune IDs are real (patch 16.19); the shares, swaps and win rates are made up.
import type { ChampionBuilds, RunePage } from "./builds";

/** Conqueror, Triumph, Alacrity, Last Stand / Second Wind, Unflinching / AS, AF, HP. */
export const conquerorPage: RunePage = {
  primaryStyleId: 8000,
  subStyleId: 8400,
  perkIds: [8010, 9111, 9104, 8299, 8444, 8242, 5005, 5008, 5011],
};

export const sampleJaxTop: ChampionBuilds = {
  patch: '16.19',
  championId: 24,
  championKey: 'Jax',
  role: 'top',
  variants: [
    {
      id: 'bruiser',
      label: 'Jax Bruiser',
      runes: conquerorPage,
      spells: [4, 12],
      skillMaxOrder: ['W', 'E', 'Q'],
      slots: [
        { slot: 'start', common: [{ itemId: 1055, share: 0.8 }, { itemId: 2003, share: 0.8 }] },
        { slot: 'first-back', common: [{ itemId: 3057, share: 0.5 }, { itemId: 1036, share: 0.3 }] },
        { slot: 'core-1', common: [{ itemId: 3078, share: 0.62 }, { itemId: 6631, share: 0.2 }] },
        { slot: 'core-2', common: [{ itemId: 6610, share: 0.41 }, { itemId: 3053, share: 0.22 }, { itemId: 3071, share: 0.18 }] },
        { slot: 'core-3', common: [{ itemId: 6333, share: 0.35 }, { itemId: 3053, share: 0.25 }] },
        { slot: 'boots', common: [{ itemId: 3047, share: 0.55 }, { itemId: 3111, share: 0.4 }] },
        { slot: 'late-4', common: [{ itemId: 3026, share: 0.3 }, { itemId: 3065, share: 0.2 }] },
      ],
      swaps: [
        {
          replacesSlot: 'core-3',
          itemId: 6609,
          trigger: 'enemy-heavy-healing',
          timing: "Buy Executioner's Calling on your first back, finish Chempunk as item 3",
          earlyComponents: [3123],
          evidence: { games: 4812, winRateDelta: 0.031 },
        },
        {
          replacesSlot: 'core-3',
          itemId: 3065,
          trigger: 'enemy-mostly-ap',
          timing: 'Finish as item 3',
          earlyComponents: [],
          evidence: { games: 2210, winRateDelta: 0.018 },
        },
      ],
      stats: { games: 21000, pickShare: 0.7, winRate: 0.512 },
    },
    {
      id: "on-hit",
      label: "Jax On-hit",
      runes: { primaryStyleId: 8000, subStyleId: 8400, perkIds: [8008, 9111, 9104, 8299, 8444, 8242, 5005, 5008, 5011] },
      spells: [4, 12],
      skillMaxOrder: ["W", "E", "Q"],
      slots: [
        { slot: "start", common: [{ itemId: 1055, share: 0.85 }, { itemId: 2003, share: 0.85 }] },
        { slot: "first-back", common: [{ itemId: 1043, share: 0.45 }, { itemId: 1053, share: 0.3 }] },
        { slot: "core-1", common: [{ itemId: 3153, share: 0.58 }, { itemId: 3302, share: 0.25 }] },
        { slot: "core-2", common: [{ itemId: 3091, share: 0.48 }, { itemId: 3124, share: 0.3 }] },
        { slot: "core-3", common: [{ itemId: 3302, share: 0.4 }, { itemId: 3181, share: 0.2 }] },
        { slot: "boots", common: [{ itemId: 3006, share: 0.6 }, { itemId: 3047, share: 0.3 }] },
        { slot: "late-4", common: [{ itemId: 3026, share: 0.35 }, { itemId: 6333, share: 0.25 }] },
      ],
      swaps: [
        {
          replacesSlot: "core-3",
          itemId: 3065,
          trigger: "enemy-mostly-ap",
          timing: "Finish as item 3",
          earlyComponents: [],
          evidence: { games: 1650, winRateDelta: 0.015 },
        },
      ],
      stats: { games: 9000, pickShare: 0.3, winRate: 0.505 },
    },
  ],
};
