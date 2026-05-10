import { liveQuery, type Observable, type Table } from 'dexie';

import { DEFAULT_SETTINGS, type Settings } from '../shared/types.js';
import { getDatabase, type SettingsRow } from '../storage/database.js';

/**
 * Read/write settings as one row per key in Dexie's `settings` store.
 *
 * Storing per-key (rather than a single JSON blob) is the shape that
 * survives the SQLite-on-disk migration (MARK-43) without restructuring
 * — a `settings(key TEXT PRIMARY KEY, value JSON)` table maps directly.
 *
 * Defaults live in `DEFAULT_SETTINGS`. `get()` always returns a fully-
 * populated `Settings` object: any key missing from the store falls
 * back to its default. Adding a new setting is purely additive: ship
 * the default, existing users see it on first read.
 */
export class SettingsService {
  private readonly table: Table<SettingsRow, string>;

  constructor(dbName?: string) {
    this.table = getDatabase(dbName).settings;
  }

  /**
   * Load all settings. Missing keys are filled from `DEFAULT_SETTINGS`,
   * unknown keys in the store are ignored (forward-compat).
   */
  async get(): Promise<Settings> {
    const rows = await this.table.toArray();
    return mergeWithDefaults(rows);
  }

  /**
   * Persist a partial settings patch. Each key in the patch becomes
   * (or overwrites) a row in the store. Returns the fully-merged
   * resulting Settings.
   */
  async update(patch: Partial<Settings>): Promise<Settings> {
    const entries = Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][];
    if (entries.length > 0) {
      await this.table.bulkPut(entries.map(([key, value]) => ({ key, value })));
    }
    return this.get();
  }

  /**
   * Live-updating observable of the current settings. Wraps Dexie's
   * `liveQuery` so any write fans out an update. Returns a Dexie
   * Observable; consumers in Preact wrap it in `useSettings()`.
   */
  observe(): Observable<Settings> {
    return liveQuery(() => this.get());
  }
}

function mergeWithDefaults(rows: SettingsRow[]): Settings {
  const stored = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));
  return {
    theme: pickEnum(stored.get('theme'), ['light', 'dark', 'auto'], DEFAULT_SETTINGS.theme),
    captureScreenshot: pickBool(
      stored.get('captureScreenshot'),
      DEFAULT_SETTINGS.captureScreenshot,
    ),
    toastDurationMs: pickNumber(stored.get('toastDurationMs'), DEFAULT_SETTINGS.toastDurationMs),
    stripTrackingParams: pickBool(
      stored.get('stripTrackingParams'),
      DEFAULT_SETTINGS.stripTrackingParams,
    ),
    maxSelectionChars: pickNumber(
      stored.get('maxSelectionChars'),
      DEFAULT_SETTINGS.maxSelectionChars,
    ),
  };
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function pickNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
