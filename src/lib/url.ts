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
