/**
 * Best-effort hostname extraction. Falls back to the raw input when the
 * URL constructor rejects it (e.g. about:blank, file:, garbage strings).
 * Never throws — UI rendering should never blow up on a malformed URL.
 */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Tracking parameters stripped from a URL when the user opts in via
 * settings. Conservative list — only well-known marketing trackers
 * with no semantic value to the page itself.
 */
const TRACKING_PARAM_NAMES = new Set([
  'fbclid',
  'gclid',
  'mc_eid',
  'mc_cid',
  'msclkid',
  'ref',
  'source',
  'yclid',
  '_ga',
]);

/**
 * Strip well-known tracking parameters from a URL's query string.
 * Returns the URL unchanged on parse error — never throws. Also
 * removes any param whose name starts with `utm_`.
 *
 * Idempotent: stripping an already-stripped URL is a no-op.
 */
export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    const toDelete: string[] = [];
    for (const name of parsed.searchParams.keys()) {
      if (TRACKING_PARAM_NAMES.has(name) || name.startsWith('utm_')) {
        toDelete.push(name);
      }
    }
    if (toDelete.length === 0) return url;
    for (const name of toDelete) parsed.searchParams.delete(name);
    return parsed.toString();
  } catch {
    return url;
  }
}
