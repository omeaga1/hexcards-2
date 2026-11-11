import type { LcuClient } from '@hexcards/engine';
import type { ChampSelectSession } from './useLeagueClient';

/**
 * Development only: a made-up champ select, to work on the app without League running. Open the dev
 * server with ?demo=champ-select (add &pick=<championId> to start with a champion hovered, and
 * &locked=1 to have it locked in). Release builds leave this out.
 */
export function demoSession(): ChampSelectSession | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== 'champ-select') return null;
  const pick = Number(params.get('pick') ?? 0);
  const locked = params.get('locked') === '1' && pick > 0;
  return {
    gameId: 1,
    localPlayerCellId: 0,
    actions: [[{ actorCellId: 0, championId: pick, completed: locked, type: 'pick' }]],
    myTeam: [
      { cellId: 0, championId: locked ? pick : 0, championPickIntent: locked ? 0 : pick, assignedPosition: params.get('role') ?? 'top' },
      { cellId: 1, championId: 64, championPickIntent: 0, assignedPosition: 'jungle' }, // Lee Sin
      { cellId: 2, championId: 0, championPickIntent: 103, assignedPosition: 'middle' }, // hovering Ahri
      { cellId: 3, championId: 51, championPickIntent: 0, assignedPosition: 'bottom' }, // Caitlyn
      { cellId: 4, championId: 412, championPickIntent: 0, assignedPosition: 'utility' }, // Thresh
    ],
    // Darius, Elise, Syndra, Kai'Sa, Lulu: mostly AP, with a shielder.
    theirTeam: [122, 60, 134, 145, 117].map((championId, i) => ({ cellId: 5 + i, championId })),
    bans: { myTeamBans: [157, 238], theirTeamBans: [266, 777] },
  };
}

/**
 * Development only: with &connected=1, a pretend League client that answers the import requests the
 * way the real one does (rune pages, item sets, spells), so the import flow can be tried in a browser.
 * Each request is logged to the console.
 */
export async function demoClient(): Promise<LcuClient | null> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== 'champ-select' || params.get('connected') !== '1') return null;
  const { default: perkstyles } = await import('@hexcards/data/fixtures/perkstyles.json');
  const pages: { id: number; isDeletable: boolean }[] = [];
  let itemSets: unknown[] = [];
  let nextId = 1000;
  return {
    async request<T>(method: string, path: string, body?: unknown) {
      // Long enough to see the key light up while it works.
      await new Promise((r) => setTimeout(r, 250));
      console.info('[demo client]', method, path, body ?? '');
      const reply = (status: number, value: unknown = null) => ({ status, body: value as T });
      if (method === 'GET' && path === '/lol-perks/v1/styles') return reply(200, perkstyles.styles);
      if (method === 'GET' && path === '/lol-perks/v1/pages') return reply(200, pages);
      if (method === 'GET' && path === '/lol-perks/v1/inventory') return reply(200, { ownedPageCount: 5 });
      if (method === 'POST' && path === '/lol-perks/v1/pages') {
        const page = { ...(body as object), id: nextId++, isEditable: true, isDeletable: true };
        pages.push(page);
        return reply(200, page);
      }
      if (method === 'PUT' && /^\/lol-perks\/v1\/pages\/\d+$/.test(path)) return reply(201);
      if (method === 'PUT' && path === '/lol-perks/v1/currentpage') return reply(204);
      if (method === 'GET' && path === '/lol-summoner/v1/current-summoner') return reply(200, { summonerId: 77 });
      if (path === '/lol-item-sets/v1/item-sets/77/sets') {
        if (method === 'GET') return reply(200, { accountId: 55, timestamp: 1, itemSets });
        itemSets = (body as { itemSets: unknown[] }).itemSets;
        return reply(201);
      }
      if (method === 'PATCH' && path === '/lol-champ-select/v1/session/my-selection') return reply(204);
      return reply(404);
    },
  };
}
