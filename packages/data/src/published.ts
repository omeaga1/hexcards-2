import { z } from 'zod';
import { ChampionBuilds } from './builds';
import type { RoleData } from './roles';

// What the pipeline (pipeline/src/build.ts) publishes:
//   <base>/latest.json                            current patch and which brackets have data
//   <base>/<patch>/<bracket>/index.json           which champions have builds, in which roles
//   <base>/<patch>/<bracket>/roles.json           role games, wins and bans (tags and tier lists)
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

export const loadLatest = async (base: string) => (await getJson(`${base}/latest.json`)) as Latest;

export const loadBuildIndex = async (base: string, patch: string, bracket: Bracket) =>
  (await getJson(`${base}/${patch}/${bracket}/index.json`)) as BuildIndex;

export const loadRoleData = async (base: string, patch: string, bracket: Bracket) =>
  (await getJson(`${base}/${patch}/${bracket}/roles.json`)) as RoleData;

/** Every role's builds for one champion, most played role first. Validated, so a bad file fails loudly. */
export async function loadChampionBuilds(base: string, patch: string, bracket: Bracket, championKey: string): Promise<ChampionBuilds[]> {
  return ChampionFile.parse(await getJson(`${base}/${patch}/${bracket}/${championKey}.json`)).roles;
}
