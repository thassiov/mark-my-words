import Dexie from 'dexie';
import type { Table } from 'dexie';

import type { Snippet } from '../shared/types.js';

import type { Repository } from './repository.js';

/**
 * Dexie database schema for mark-my-words.
 *
 * Schema indexes (the `'id, createdAt, sourceUrl'` syntax):
 *   - `id`         primary key
 *   - `createdAt`  indexed for newest-first queries
 *   - `sourceUrl`  indexed for "snippets from this domain" filters
 *
 * Other fields (selectedText, contextBefore, …, screenshotDataUrl) are
 * stored alongside but unindexed. Full-text search would need a
 * separate index strategy when we add it later.
 */
class MmwDatabase extends Dexie {
  snippets!: Table<Snippet, string>;

  constructor(name = 'mmw') {
    super(name);
    this.version(1).stores({
      snippets: 'id, createdAt, sourceUrl',
    });
  }
}

/**
 * `Repository<T>` implementation backed by Dexie / IndexedDB.
 *
 * Only typed for {@link Snippet} today since that's the only entity
 * type we persist. Generalizing later is mechanical (one Dexie table
 * per type).
 *
 * Persistence quota is the browser's IDB origin quota (typically
 * tens of percent of free disk) — not the chrome.storage.local 10 MB
 * cap that the old BrowserLocalRepo lived under.
 */
export class IdbRepo implements Repository<Snippet> {
  private readonly table: Table<Snippet, string>;

  constructor(dbName?: string) {
    const db = new MmwDatabase(dbName);
    this.table = db.snippets;
  }

  async getAll(): Promise<Snippet[]> {
    return this.table.toArray();
  }

  async getById(id: string): Promise<Snippet | null> {
    const found = await this.table.get(id);
    return found ?? null;
  }

  async put(item: Snippet): Promise<void> {
    await this.table.put(item);
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async count(): Promise<number> {
    return this.table.count();
  }
}
