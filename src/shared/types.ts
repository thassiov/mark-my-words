/**
 * The library stores two kinds of things:
 *
 *   - **Selection** — a slice of text the user highlighted on a page,
 *     with surrounding context and page metadata.
 *   - **Page** — the page itself (title, URL, screenshot), no excerpt.
 *
 * They share most of their shape (provenance, screenshot, user meta,
 * audit fields). Composition via small interfaces keeps the shared
 * pieces honest; `type` is the discriminator.
 */

export interface Identity {
  /** ULID — sortable by creation time. */
  id: string;
}

export interface Audit {
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp; equals createdAt at first save. */
  updatedAt: string;
  /**
   * ISO 8601 timestamp set when the record is archived. Absent on
   * active records. Archive is a state — not a soft delete; archived
   * records are kept in their own list with their own sort order.
   */
  archivedAt?: string;
}

export interface Source {
  /** URL of the top-level page where the record was captured. */
  sourceUrl: string;
  /** URL of the iframe, if the capture happened inside one. */
  iframeUrl?: string;
  /** Page title at save time. */
  pageTitle: string;
}

export interface Capture {
  /**
   * Page screenshot captured at save time. JPEG data URL. Optional
   * because capture can fail on restricted pages and we still persist
   * the rest of the record.
   */
  screenshotDataUrl?: string;
}

/**
 * A single user note attached to a record. Records keep an array of
 * notes (newest-first) which the user can post / edit / delete
 * independently. The array can be absent (no notes) or present with
 * 0+ entries.
 */
export interface Note {
  /** ULID — sortable, stable across edits. */
  id: string;
  /** The note's text content. Free-form. */
  text: string;
  /** ISO 8601 timestamp of when the note was first posted. */
  createdAt: string;
  /** ISO 8601 timestamp; bumps on edit, equals createdAt at first post. */
  updatedAt: string;
}

export interface UserMeta {
  /**
   * Notes attached to the record, newest-first. Absent means "no
   * notes". Array order is the storage order — UI renders as-is.
   *
   * Replaces the legacy single `note: string` field. Records persisted
   * before this change are migrated on first read in `IdbRepo` (see
   * `withMigratedNotes`).
   */
  notes?: Note[];
  /**
   * User-defined tags for grouping. Stored normalized: trimmed,
   * lowercased, deduped. Empty array and absent field mean the same
   * thing — older records created before tags existed simply omit it.
   */
  tags?: string[];
}

export interface SelectionBody {
  /** The text the user actually selected. */
  selectedText: string;
  /** Up to ~200 chars of context immediately before the selection. */
  contextBefore: string;
  /** Up to ~200 chars of context immediately after the selection. */
  contextAfter: string;
}

/**
 * A saved text selection with its provenance. All fields under Source
 * and SelectionBody are immutable after creation; UserMeta and the
 * archive state are mutable via dedicated operations.
 */
export interface Selection extends Identity, Audit, Source, Capture, UserMeta, SelectionBody {
  type: 'selection';
}

/**
 * A saved page (no body excerpt). Same provenance + meta as Selection,
 * minus the SelectionBody fields.
 */
export interface Page extends Identity, Audit, Source, Capture, UserMeta {
  type: 'page';
}

/**
 * Discriminated union of every storable record kind. Branching on
 * `record.type` narrows to the concrete entity.
 *
 * Note: shadows the TS built-in `Record<K, V>` utility type within any
 * file that imports this name. The two cannot coexist in the same
 * scope — files that need `Record<K, V>` should use an inline index
 * signature (`{ [k: string]: V }`) or a small local alias instead.
 */
export type Record = Selection | Page;

/** Input shape for creating a new selection. id/type/timestamps assigned by the service. */
export type SelectionInput = Omit<Selection, 'id' | 'type' | 'createdAt' | 'updatedAt'>;

/** Input shape for creating a new page. id/type/timestamps assigned by the service. */
export type PageInput = Omit<Page, 'id' | 'type' | 'createdAt' | 'updatedAt'>;

/**
 * Patch shape for editing an existing record's tags. Notes have their
 * own dedicated dispatcher ops (`record:add-note` / `edit-note` /
 * `delete-note`) — they don't go through this generic update.
 *
 * `tags` is `T | undefined` (not just `T`) so callers can explicitly
 * pass `undefined` to clear the value, distinct from omitting the key
 * (which leaves the field untouched).
 */
export interface RecordEdit {
  tags?: string[] | undefined;
}

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

/**
 * Theme preference. `auto` defers to `prefers-color-scheme`. Stored
 * with the user's data (travels with the file in file mode), not in
 * chrome.storage.local.
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * Per-user settings. Live in the `settings` Dexie store today,
 * serialized as one row per key. Travel with the data file in file
 * mode (MARK-43).
 *
 * Adding a setting: add a field here + a default in `DEFAULT_SETTINGS`,
 * and any consumer can use `settings.<field>` after a `SettingsService.get()`.
 * No schema-version bump needed for additive changes — missing keys
 * fall back to the default automatically.
 */
export interface Settings {
  /** Theme preference. */
  theme: Theme;
  /** Capture a page screenshot on save. */
  captureScreenshot: boolean;
  /**
   * How long the post-save toast pill stays visible before
   * auto-dismissing. `0` disables auto-dismiss entirely.
   */
  toastDurationMs: number;
  /**
   * Strip common URL tracking parameters (`utm_*`, `fbclid`, `gclid`,
   * `mc_eid`, `ref`, `source`) from the source URL on save.
   */
  stripTrackingParams: boolean;
  /**
   * Maximum allowed character count for a saved selection. Selections
   * exceeding this are rejected with a toast at save time.
   */
  maxSelectionChars: number;
}

/**
 * Defaults applied on first run and as fallback for any key missing
 * from the stored blob.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  captureScreenshot: true,
  toastDurationMs: 5000,
  stripTrackingParams: true,
  maxSelectionChars: 5000,
};
