/**
 * Result of {@link readSelectionInPage}. Shape matches `SnippetInput`
 * but is duplicated here so this file has *no* imports — it gets
 * serialized via `chrome.scripting.executeScript({ func })` and runs in
 * the page context where bundler-introduced helpers wouldn't resolve.
 */
export interface ReadSelectionResult {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  sourceUrl: string;
  pageTitle: string;
  iframeUrl?: string;
}

/**
 * Read the current text selection plus up to MAX_CONTEXT chars of
 * surrounding text. Returns null if nothing meaningful is selected.
 *
 * **No module imports.** This function is shipped to the page context
 * via `chrome.scripting.executeScript({ func: readSelectionInPage })`.
 * Anything it references at runtime must be available in that context
 * (DOM globals are fine; closures over module-scope vars are not).
 *
 * v0 limitations:
 *   - Cross-element selections only get the text of the start/end text
 *     nodes for context. Spanning multiple elements doesn't aggregate.
 *   - Selections inside iframes won't be captured if the script runs in
 *     the top frame only. We currently inject only on the top frame.
 */
export function readSelectionInPage(): ReadSelectionResult | null {
  const MAX_CONTEXT = 200;

  const sel = window.getSelection();
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString();
  if (text.trim().length === 0) return null;

  const range = sel.getRangeAt(0);
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;

  let contextBefore = '';
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const data = (startContainer as Text).data;
    const start = Math.max(0, range.startOffset - MAX_CONTEXT);
    contextBefore = data.slice(start, range.startOffset);
  }

  let contextAfter = '';
  if (endContainer.nodeType === Node.TEXT_NODE) {
    const data = (endContainer as Text).data;
    contextAfter = data.slice(range.endOffset, range.endOffset + MAX_CONTEXT);
  }

  const result: ReadSelectionResult = {
    selectedText: text,
    contextBefore,
    contextAfter,
    sourceUrl: location.href,
    pageTitle: document.title,
  };

  if (window !== window.parent) {
    result.iframeUrl = location.href;
  }

  return result;
}
