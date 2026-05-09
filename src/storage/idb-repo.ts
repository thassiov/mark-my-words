import Dexie from 'dexie';
import type { Table } from 'dexie';

import { newId } from '../lib/ulid.js';
import type { Note, Record } from '../shared/types.js';

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
    return all.map((r) => migrate(r));
  }

  async getById(id: string): Promise<Record | null> {
    const found = await this.table.get(id);
    return found === undefined ? null : migrate(found);
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
 * Apply read-side migrations in order. New migrations append here.
 * Each step returns either the same reference (no change) or a new
 * object with the desired shape. Compose without coupling.
 */
function migrate(rec: Record): Record {
  return withMigratedNotes(withDefaultType(rec));
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

/**
 * Migrate the legacy single-`note` field into the new `notes` array.
 *
 * Records persisted before the comment-thread refactor have a single
 * `note: string` field (or no note at all). The new schema has
 * `notes: Note[]` with newest-first ordering.
 *
 * Synthesize a single-element array from the legacy text, then strip
 * the legacy field so subsequent writes never persist it again. The
 * synthesized note's createdAt/updatedAt borrow the record's own
 * audit timestamps (we don't know when the legacy note was actually
 * written).
 */
function withMigratedNotes(rec: Record): Record {
  const raw = rec as unknown as { note?: unknown; notes?: unknown };
  if (raw.notes !== undefined) return rec;
  if (typeof raw.note !== 'string' || raw.note.length === 0) return rec;
  const synthesized: Note = {
    id: newId(),
    text: raw.note,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
  const next = { ...rec, notes: [synthesized] } as Record & { note?: string };
  delete next.note;
  return next;
}
