import type { ChampSelectSession } from './useLeagueClient';

/**
 * Development only: a made-up champ select, to work on the app without League running. Open the dev
 * server with ?demo=champ-select (add &pick=<championId> to start with a champion hovered). Release
 * builds leave this out.
 */
export function demoSession(): ChampSelectSession | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') !== 'champ-select') return null;
  return {
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, championId: 0, championPickIntent: Number(params.get('pick') ?? 0), assignedPosition: params.get('role') ?? 'top' },
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
