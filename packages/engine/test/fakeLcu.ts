import type { LcuItemSet, LcuPerkPage } from '@hexcards/data';
import type { LcuClient } from '../src';
import { styles } from './fixtures';

/** An in-memory League client that behaves like the real endpoints Hex Cards uses. */
export class FakeLcu implements LcuClient {
  calls: string[] = [];
  pages: LcuPerkPage[];
  itemSets: LcuItemSet[];
  currentPageId?: number;
  selection = { spell1Id: 0, spell2Id: 0 };
  ownedPageCount: number;
  private nextId = 1000;

  constructor(opts: { pages?: LcuPerkPage[]; itemSets?: LcuItemSet[]; ownedPageCount?: number } = {}) {
    this.pages = structuredClone(opts.pages ?? []);
    this.itemSets = structuredClone(opts.itemSets ?? []);
    this.ownedPageCount = opts.ownedPageCount ?? 5;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
    this.calls.push(`${method} ${path}`);
    const reply = (status: number, value: unknown = null) => ({ status, body: value as T });
    const pageMatch = path.match(/^\/lol-perks\/v1\/pages\/(\d+)$/);

    if (method === 'GET' && path === '/lol-perks/v1/styles') return reply(200, styles);
    if (method === 'GET' && path === '/lol-perks/v1/pages') return reply(200, this.pages);
    if (method === 'GET' && path === '/lol-perks/v1/inventory') return reply(200, { ownedPageCount: this.ownedPageCount });
    if (method === 'POST' && path === '/lol-perks/v1/pages') {
      if (this.pages.filter((p) => p.isDeletable).length >= this.ownedPageCount) return reply(400, { message: 'Max pages reached' });
      const page = { ...(body as object), id: this.nextId++, isEditable: true, isDeletable: true } as LcuPerkPage;
      this.pages.push(page);
      return reply(200, page);
    }
    if (method === 'PUT' && pageMatch) {
      const i = this.pages.findIndex((p) => p.id === Number(pageMatch[1]));
      if (i < 0 || !this.pages[i]!.isEditable) return reply(404);
      this.pages[i] = { ...this.pages[i]!, ...(body as object) };
      return reply(201);
    }
    if (method === 'PUT' && path === '/lol-perks/v1/currentpage') {
      this.currentPageId = body as number;
      return reply(204);
    }
    if (method === 'GET' && path === '/lol-summoner/v1/current-summoner') return reply(200, { summonerId: 77, accountId: 55 });
    if (path === '/lol-item-sets/v1/item-sets/77/sets') {
      if (method === 'GET') return reply(200, { accountId: 55, timestamp: 1, itemSets: this.itemSets });
      if (method === 'PUT') {
        this.itemSets = (body as { itemSets: LcuItemSet[] }).itemSets;
        return reply(201);
      }
    }
    if (method === 'PATCH' && path === '/lol-champ-select/v1/session/my-selection') {
      this.selection = body as typeof this.selection;
      return reply(204);
    }
    return reply(404);
  }
}
