/**
 * Result of {@link readPageInPage}. Shape matches `PageInput` (minus
 * `screenshotDataUrl` which the SW captures separately) but is
 * duplicated here so this file has *no* imports — see
 * {@link readSelectionInPage} for the same constraint.
 */
export interface ReadPageResult {
  sourceUrl: string;
  pageTitle: string;
  iframeUrl?: string;
}

/**
 * Capture the bare-page metadata we save for a "Save page" action:
 * source URL, page title, and (if we happened to run inside an iframe)
 * the iframe URL.
 *
 * **No module imports.** Shipped to the page context via
 * `chrome.scripting.executeScript({ func: readPageInPage })`. Anything
 * referenced at runtime must be available in that context (DOM globals
 * are fine; closures over module-scope vars are not).
 *
 * Always returns a result — unlike {@link readSelectionInPage} which can
 * return null when there's no selection. A page always has a URL and
 * a title (possibly empty), so failure modes here come from being
 * blocked entirely by Chromium (chrome:// pages, etc.) — handled at
 * the SW layer when `executeScript` rejects.
 */
export function readPageInPage(): ReadPageResult {
  const result: ReadPageResult = {
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
