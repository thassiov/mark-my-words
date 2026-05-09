import Dexie from 'dexie';
import type { Table } from 'dexie';

import type { Record } from '../shared/types.js';

import type { Repository } from './repository.js';

/**
 * Dexie database schema for mark-my-words.
 *
 * Schema indexes (the `'id, createdAt, sourceUrl'` syntax):
 *   - `id`         primary key
 *   - `createdAt`  indexed for newest-first queries
 *   - `sourceUrl`  indexed for "records from this domain" filters
 *
 * Other fields (selectedText, contextBefore, …, screenshotDataUrl) are
 * stored alongside but unindexed. Full-text search would need a
 * separate index strategy when we add it later.
 *
 * The IDB store name `snippets` is preserved from the pre-Record-rename
 * era so existing user data keeps working without a Dexie version bump.
 * Records of type 'page' simply omit the SelectionBody fields.
 */
class MmwDatabase extends Dexie {
  snippets!: Table<Record, string>;

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
 * Persistence quota is the browser's IDB origin quota (typically
 * tens of percent of free disk) — not the chrome.storage.local 10 MB
 * cap that the old BrowserLocalRepo lived under.
 *
 * Reads apply a backwards-compat backfill: records persisted before
 * the discriminator was introduced have no `type` field and are
 * treated as selections (the only kind that existed at the time).
 */
export class IdbRepo implements Repository<Record> {
  private readonly table: Table<Record, string>;

  constructor(dbName?: string) {
    const db = new MmwDatabase(dbName);
    this.table = db.snippets;
  }

  async getAll(): Promise<Record[]> {
    const all = await this.table.toArray();
    return all.map((r) => withDefaultType(r));
  }

  async getById(id: string): Promise<Record | null> {
    const found = await this.table.get(id);
    return found === undefined ? null : withDefaultType(found);
  }

  async put(item: Record): Promise<void> {
    await this.table.put(item);
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  async count(): Promise<number> {
    return this.table.count();
  }
}

/**
 * Pre-discriminator records were always selections. Default the missing
 * `type` so consumers can rely on the union narrowing. Typed via
 * `unknown` because, at the IDB boundary, we genuinely don't know if
 * the field is present yet.
 */
function withDefaultType(rec: Record): Record {
  const raw = rec as unknown as { type?: unknown };
  if (raw.type === undefined) {
    return { ...rec, type: 'selection' } as Record;
  }
  return rec;
}
