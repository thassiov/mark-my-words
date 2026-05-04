/**
 * Current ISO 8601 timestamp. Wrapped so tests can mock the clock.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/**
 * Render an ISO 8601 timestamp as a short, locale-aware relative time
 * ("just now", "5 minutes ago", "yesterday", "3 days ago", etc.).
 *
 * For times older than ~30 days, returns the ISO date (`YYYY-MM-DD`)
 * instead of pretending to know the relative distance — at that range
 * the absolute date is more useful and unambiguous.
 *
 * @param iso  ISO 8601 timestamp
 * @param now  optional reference point (Date or ISO string); defaults
 *             to `new Date()`. Inject for tests.
 */
export function formatRelative(iso: string, now: Date | string = new Date()): string {
  const past = new Date(iso).getTime();
  const ref = (now instanceof Date ? now : new Date(now)).getTime();
  const seconds = Math.round((past - ref) / 1000);

  if (Math.abs(seconds) < 30) return 'just now';
  if (Math.abs(seconds) < 60) return rtf.format(seconds, 'second');

  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');

  return new Date(iso).toISOString().slice(0, 10);
}
