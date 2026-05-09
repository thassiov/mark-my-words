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

export interface UserMeta {
  /** Free-form user note. */
  note?: string;
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
 * Patch shape for editing an existing record. UserMeta-only — Source,
 * Capture, and SelectionBody are immutable.
 *
 * Both fields are `T | undefined` (not just `T`) so callers can
 * explicitly pass `undefined` to clear the value. This differs from
 * omitting the key entirely (which leaves the field untouched).
 */
export interface RecordEdit {
  note?: string | undefined;
  tags?: string[] | undefined;
}
