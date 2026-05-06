/**
 * A saved text snippet with its provenance.
 *
 * Provenance fields ({@link Snippet.sourceUrl}, {@link Snippet.iframeUrl},
 * {@link Snippet.pageTitle}, {@link Snippet.contextBefore},
 * {@link Snippet.contextAfter}) are immutable after creation; edits only
 * touch {@link Snippet.selectedText} and {@link Snippet.note}.
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
}

/**
 * Input shape for creating a new snippet — id and timestamps are
 * assigned by {@link SnippetService.save}.
 */
export type SnippetInput = Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Patch shape for editing an existing snippet. Only {@link Snippet.note}
 * is user-editable; all other fields are provenance and stay immutable.
 *
 * `note` is `string | undefined` (not just `string`) so callers can
 * explicitly pass `note: undefined` to clear an existing note. This
 * differs from omitting the key entirely (which leaves the note untouched).
 */
export interface SnippetEdit {
  note?: string | undefined;
}
