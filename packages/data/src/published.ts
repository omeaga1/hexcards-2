import { z } from 'zod';
import { ChampionBuilds } from './builds';

// Builds published by the pipeline (pipeline/src/build.ts):
//   <base>/latest.json                 which patch is current
//   <base>/<patch>/index.json          which champions have builds, in which roles
//   <base>/<patch>/<ChampionKey>.json  every role's builds for one champion

export interface BuildIndex {
  patch: string;
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

export async function loadBuildIndex(base: string): Promise<BuildIndex> {
  const latest = (await getJson(`${base}/latest.json`)) as { patch: string };
  return (await getJson(`${base}/${latest.patch}/index.json`)) as BuildIndex;
}

/** Every role's builds for one champion, most played role first. Validated, so a bad file fails loudly. */
export async function loadChampionBuilds(base: string, patch: string, championKey: string): Promise<ChampionBuilds[]> {
  return ChampionFile.parse(await getJson(`${base}/${patch}/${championKey}.json`)).roles;
}
