/**
 * A saved text snippet with its provenance.
 *
 * Provenance fields ({@link Snippet.selectedText}, {@link Snippet.sourceUrl},
 * {@link Snippet.iframeUrl}, {@link Snippet.pageTitle},
 * {@link Snippet.contextBefore}, {@link Snippet.contextAfter}) are
 * immutable after creation. The mutable fields are {@link Snippet.note}
 * (via {@link SnippetEdit}) and the archive marker
 * {@link Snippet.archivedAt} (via the dedicated archive/unarchive ops).
 */
export interface Snippet {
  /** ULID — sortable by creation time. */
  id: string;
  /** The text the user actually selected. */
  selectedText: string;
  /** Up to ~200 chars of context immediately before the selection. */
  contextBefore: string;
  /** Up to ~200 chars of context immediately after the selection. */
  contextAfter: string;
  /** URL of the top-level page where the selection was made. */
  sourceUrl: string;
  /** URL of the iframe, if the selection was inside one. */
  iframeUrl?: string;
  /** Page title at save time. */
  pageTitle: string;
  /** Free-form user note. */
  note?: string;
  /**
   * User-defined tags for grouping. Stored normalized: trimmed,
   * lowercased, deduped. Empty array and absent field mean the same
   * thing — older snippets created before tags existed simply omit it.
   */
  tags?: string[];
  /**
   * Page screenshot captured at save time. JPEG data URL. The browser's
   * native selection highlight is rendered into the capture — no
   * canvas overlay drawing.
   *
   * Optional because capture can fail on restricted pages and we still
   * persist the rest of the snippet.
   */
  screenshotDataUrl?: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp; equals createdAt at first save. */
  updatedAt: string;
  /**
   * ISO 8601 timestamp set when the snippet is archived. Absent on
   * active snippets. Archive is a state — not a soft delete; archived
   * snippets are kept in their own list with their own sort order.
   */
  archivedAt?: string;
}

/**
 * Input shape for creating a new snippet — id and timestamps are
 * assigned by {@link SnippetService.save}.
 */
export type SnippetInput = Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Patch shape for editing an existing snippet. {@link Snippet.note} and
 * {@link Snippet.tags} are user-editable; all other fields are provenance
 * and stay immutable.
 *
 * Both fields are `T | undefined` (not just `T`) so callers can
 * explicitly pass `undefined` to clear the value. This differs from
 * omitting the key entirely (which leaves the field untouched).
 */
export interface SnippetEdit {
  note?: string | undefined;
  tags?: string[] | undefined;
}
