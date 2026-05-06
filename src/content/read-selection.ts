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
 * Context strategy: walk every text node under `document.body`,
 * classify each against the selection range, and accumulate text on
 * either side. This handles element-node anchors (e.g. `<img>` wrappers),
 * full-text-node selections, and cross-element selections — all cases
 * where the prior text-node-only implementation produced empty context.
 *
 * Limitations:
 *   - Selections inside iframes won't be captured if the script runs in
 *     the top frame only. We currently inject only on the top frame.
 */
export function readSelectionInPage(): ReadSelectionResult | null {
  const MAX_CONTEXT = 200;

  const sel = globalThis.getSelection();
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) return null;

  // Normalize: collapse all whitespace sequences (including \n injected by
  // replaced elements like <img>) to a single space, then trim.
  const text = sel.toString().replaceAll(/\s+/g, ' ').trim();
  if (text.length === 0) return null;

  const range = sel.getRangeAt(0);
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;

  let contextBefore = '';
  let contextAfter = '';

  // Scope the context walk to the nearest block-level ancestor of the
  // selection's common ancestor. This keeps "context" close to the
  // selection — same paragraph for a small in-paragraph selection;
  // a wider section only when the selection itself crosses paragraphs.
  const BLOCK_TAGS = new Set([
    'P',
    'DIV',
    'LI',
    'BLOCKQUOTE',
    'ARTICLE',
    'SECTION',
    'ASIDE',
    'HEADER',
    'FOOTER',
    'MAIN',
    'FIGURE',
    'FIGCAPTION',
    'NAV',
    'BODY',
    'HTML',
    'TD',
    'TH',
    'DL',
    'DD',
    'DT',
    'PRE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'UL',
    'OL',
    'TABLE',
    'TR',
    'TBODY',
    'THEAD',
    'TFOOT',
    'FORM',
    'FIELDSET',
    'ADDRESS',
  ]);
  let scope: Element | null =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  while (scope !== null && !BLOCK_TAGS.has(scope.tagName)) {
    scope = scope.parentElement;
  }
  const root = scope ?? document.body;
  // Skip text inside elements that aren't visible/readable content —
  // <style>, <script>, <noscript>, <template>. Otherwise stylesheet
  // rules and inline scripts leak into contextBefore/contextAfter.
  const SKIP_PARENT_TAGS = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEMPLATE']);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent !== null && SKIP_PARENT_TAGS.has(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const tn = n as Text;
    const data = tn.data;
    if (data.length === 0) continue;

    // Classify the text node by comparing its endpoints against the
    // range. Range.comparePoint returns -1 (before), 0 (inside), 1 (after).
    let startCmp: number;
    let endCmp: number;
    try {
      startCmp = range.comparePoint(tn, 0);
      endCmp = range.comparePoint(tn, data.length);
    } catch {
      // comparePoint can throw if the node isn't comparable to the range.
      continue;
    }

    if (endCmp === -1) {
      // Entirely before the selection.
      contextBefore += data;
    } else if (startCmp === 1) {
      // Entirely after the selection.
      contextAfter += data;
    } else if (startCmp === 0 && endCmp === 0) {
      // Entirely inside — part of the selection itself.
    } else if (tn === startContainer && tn === endContainer) {
      contextBefore += data.slice(0, range.startOffset);
      contextAfter += data.slice(range.endOffset);
    } else if (tn === startContainer) {
      contextBefore += data.slice(0, range.startOffset);
    } else if (tn === endContainer) {
      contextAfter += data.slice(range.endOffset);
    } else if (endCmp === 0 && startCmp === -1) {
      // Boundary lands exactly at this node's end — treat as fully before.
      contextBefore += data;
    } else if (startCmp === 0 && endCmp === 1) {
      // Boundary lands exactly at this node's start — treat as fully after.
      contextAfter += data;
    }

    // Bound buffers so a long page doesn't blow up memory.
    if (contextBefore.length > MAX_CONTEXT) {
      contextBefore = contextBefore.slice(-MAX_CONTEXT);
    }
    if (contextAfter.length >= MAX_CONTEXT) {
      contextAfter = contextAfter.slice(0, MAX_CONTEXT);
      break;
    }
  }

  contextBefore = contextBefore.slice(-MAX_CONTEXT);
  contextAfter = contextAfter.slice(0, MAX_CONTEXT);

  const result: ReadSelectionResult = {
    selectedText: text,
    contextBefore,
    contextAfter,
    sourceUrl: location.href,
    pageTitle: document.title,
  };

  // `globalThis` doesn't carry `.parent` in the TS lib types; the iframe
  // check is genuinely about the Window object and reads naturally as such.
  // eslint-disable-next-line unicorn/prefer-global-this
  if (window !== window.parent) {
    result.iframeUrl = location.href;
  }

  return result;
}
