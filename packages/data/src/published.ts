import { z } from 'zod';
import { ChampionBuilds, distinctCorePath, type Trait } from './builds';
import type { Role, RoleData } from './roles';

// What the pipeline (pipeline/src/build.ts) publishes:
//   <base>/latest.json                            current patch and which brackets have data
//   <base>/<patch>/traits.json                    champion traits (healer, tank, ...) for tagging teams
//   <base>/<patch>/<bracket>/index.json           which champions have builds, in which roles
//   <base>/<patch>/<bracket>/roles.json           role games, wins and bans (tags and tier lists)
//   <base>/<patch>/<bracket>/picks.json           per role: wins with each team trait and against each lane opponent
//   <base>/<patch>/<bracket>/<ChampionKey>.json   every role's builds for one champion

/** Rank brackets: New is Iron to Silver, Climbing is Gold to Emerald, Pro is Diamond and above. */
export const BRACKETS = ['new', 'climbing', 'pro'] as const;
export type Bracket = (typeof BRACKETS)[number];
export const BRACKET_LABELS: Record<Bracket, string> = { new: 'New', climbing: 'Climbing', pro: 'Pro' };
export const BRACKET_RANKS: Record<Bracket, string> = { new: 'Iron to Silver', climbing: 'Gold to Emerald', pro: 'Diamond and above' };

export interface Latest {
  patch: string;
  generatedAt: string;
  /** Games per bracket. Brackets missing here have no data yet. */
  brackets: Partial<Record<Bracket, number>>;
}

export interface BuildIndex {
  patch: string;
  bracket: Bracket;
  generatedAt: string;
  /** Games the builds were made from. */
  games: number;
  /** Roles most played first; variants are build names without the champion, e.g. "Bruiser". */
  champions: Record<string, { key: string; roles: { role: ChampionBuilds['role']; games: number; variants: string[] }[] }>;
}

const ChampionFile = z.object({
  patch: z.string(),
  championId: z.number(),
  championKey: z.string(),
  roles: z.array(ChampionBuilds),
});

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** One champion in one role: [games, wins] overall, with each team trait in play, and against each lane opponent. */
export interface PickStats {
  games: number;
  wins: number;
  traits: Partial<Record<Trait, [number, number]>>;
  /** Lane opponent's champion ID → [games, wins]. Pairs seen fewer than 3 times are left out. */
  vs: Record<string, [number, number]>;
}

/** The published picks.json: champion ID → role → stats. */
export type PickTable = Record<string, Partial<Record<Role, PickStats>>>;

export const loadLatest = async (base: string) => (await getJson(`${base}/latest.json`)) as Latest;

export const loadBuildIndex = async (base: string, patch: string, bracket: Bracket) =>
  (await getJson(`${base}/${patch}/${bracket}/index.json`)) as BuildIndex;

export const loadRoleData = async (base: string, patch: string, bracket: Bracket) =>
  (await getJson(`${base}/${patch}/${bracket}/roles.json`)) as RoleData;

/**
 * Every role's builds for one champion, most played role first. Validated, so a bad file fails loudly.
 * Files published before the pipeline kept core items distinct get the same fix here.
 */
export async function loadChampionBuilds(base: string, patch: string, bracket: Bracket, championKey: string): Promise<ChampionBuilds[]> {
  const roles = ChampionFile.parse(await getJson(`${base}/${patch}/${bracket}/${championKey}.json`)).roles;
  return roles.map((r) => ({ ...r, variants: r.variants.map((v) => ({ ...v, slots: distinctCorePath(v.slots) })) }));
}

export const loadPickTable = async (base: string, patch: string, bracket: Bracket) =>
  (await getJson(`${base}/${patch}/${bracket}/picks.json`)) as PickTable;

/** champion ID → traits ("ap", "ad", "healer", "tank", "shielder", "cc"), from what champions do in games. */
export const loadTraitTable = async (base: string, patch: string) =>
  (await getJson(`${base}/${patch}/traits.json`)) as Record<string, string[]>;
