import Dexie from 'dexie';
import type { Table } from 'dexie';

import type { Record } from '../shared/types.js';

/**
 * Per-key row in the `settings` store. The value is JSON-friendly —
 * primitive or simple object.
 */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/**
 * Per-key row in the `meta` store. Used today for `schema_version`,
 * `created_at`, `last_write_at`, and similar bookkeeping.
 */
export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * Dexie database for mark-my-words.
 *
 * Schema history:
 *  - v1: `snippets` store ('id, createdAt, sourceUrl').
 *  - v2: adds `meta` and `settings` stores. Existing snippets data
 *    untouched. Both new stores are key-value with primary key `key`.
 *
 * The IDB store name `snippets` is preserved across the
 * Snippet→Record rename so existing user data keeps working without a
 * Dexie version bump for that. Records of type 'page' simply omit
 * the SelectionBody fields.
 *
 * Settings travel with the data (in file mode the settings rows are
 * inside the SQLite file alongside records). Extension-only state
 * (active storage mode, file handle) lives elsewhere — see
 * workbench/dev/mark-my-words/12-settings-and-storage.md.
 */
export class MmwDatabase extends Dexie {
  snippets!: Table<Record, string>;
  meta!: Table<MetaRow, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name = 'mmw') {
    super(name);
    this.version(1).stores({
      snippets: 'id, createdAt, sourceUrl',
    });
    this.version(2).stores({
      snippets: 'id, createdAt, sourceUrl',
      meta: 'key',
      settings: 'key',
    });
  }
}

/**
 * Module-scoped singleton. Lazily constructed so test code can pass
 * a custom `dbName` via `getDatabase('mmw-test-...')` before any
 * default access — but most code just calls `getDatabase()` and gets
 * the production instance.
 */
let instance: MmwDatabase | null = null;

export function getDatabase(name?: string): MmwDatabase {
  if (instance !== null) {
    if (name !== undefined && instance.name !== name) {
      throw new Error(
        `getDatabase called with name=${name} but instance is already bound to ${instance.name}`,
      );
    }
    return instance;
  }
  instance = new MmwDatabase(name);
  return instance;
}

/** Test-only: drop the cached singleton so the next getDatabase() rebuilds. */
export function resetDatabaseForTesting(): void {
  instance = null;
}
