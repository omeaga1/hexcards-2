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
};
