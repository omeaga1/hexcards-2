import { OPGG_REGIONS, type Region } from '@hexcards/data';
import type { PlayerRef } from './players';

// Per-device conveniences. Everything still works if storage is unavailable.

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting just won't be remembered.
  }
};

export const settings = {
  flashKey: (): 'D' | 'F' => (read('hexcards.flashKey') === 'F' ? 'F' : 'D'),
  setFlashKey: (key: 'D' | 'F') => write('hexcards.flashKey', key),
  /** The rune page Hex Cards created, so later imports update it instead of making another. */
  runePageId: (): number | undefined => {
    const id = Number(read('hexcards.runePageId'));
    return Number.isFinite(id) && id > 0 ? id : undefined;
  },
  setRunePageId: (id: number) => write('hexcards.runePageId', String(id)),
  recentChampions: (): number[] => {
    try {
      const ids = JSON.parse(read('hexcards.recent') ?? '[]');
      return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      return [];
    }
  },
  setRecentChampions: (ids: number[]) => write('hexcards.recent', JSON.stringify(ids)),
  showRoleIcons: (): boolean => read('hexcards.showRoleIcons') !== 'false',
  setShowRoleIcons: (on: boolean) => write('hexcards.showRoleIcons', String(on)),
  roleView: (): 'tiers' | 'grid' => (read('hexcards.roleView') === 'grid' ? 'grid' : 'tiers'),
  setRoleView: (view: 'tiers' | 'grid') => write('hexcards.roleView', view),
  bracket: (): 'new' | 'climbing' | 'pro' => {
    const b = read('hexcards.bracket');
    return b === 'new' || b === 'climbing' ? b : 'pro';
  },
  setBracket: (b: 'new' | 'climbing' | 'pro') => write('hexcards.bracket', b),
  /** Players you pinned on the Players page, in the order you pinned them. */
  pinnedPlayers: (): PlayerRef[] => readPlayers('hexcards.pinnedPlayers'),
  setPinnedPlayers: (players: PlayerRef[]) => write('hexcards.pinnedPlayers', JSON.stringify(players)),
  /** You: your stats open first, with or without League running. */
  me: (): PlayerRef | null => readPlayers('hexcards.me')[0] ?? null,
  setMe: (player: PlayerRef) => write('hexcards.me', JSON.stringify([player])),
  /** The region player searches use. */
  region: (): Region | null => {
    const r = read('hexcards.region');
    return (OPGG_REGIONS as readonly string[]).includes(r ?? '') ? (r as Region) : null;
  },
  setRegion: (region: Region) => write('hexcards.region', region),
  /** Players you looked up, newest first. */
  recentPlayers: (): PlayerRef[] => readPlayers('hexcards.recentPlayers'),
  setRecentPlayers: (players: PlayerRef[]) => write('hexcards.recentPlayers', JSON.stringify(players)),
};

function readPlayers(key: string): PlayerRef[] {
  try {
    const list = JSON.parse(read(key) ?? '[]');
    return Array.isArray(list)
      ? list.filter((p): p is PlayerRef => typeof p?.puuid === 'string' && typeof p?.gameName === 'string' && typeof p?.tagLine === 'string')
          .map((p) => ({
            ...p,
            profileIconId: Number.isInteger(p.profileIconId) ? p.profileIconId : 29,
            // Saved before regions existed (0.3.0): those came from the client, on your server.
            region: (OPGG_REGIONS as readonly string[]).includes(p.region) ? p.region : (read('hexcards.region') as Region | null) ?? 'NA',
          }))
      : [];
  } catch {
    return [];
  }
}
