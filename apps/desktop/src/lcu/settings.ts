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
};
