/**
 * Current ISO 8601 timestamp. Wrapped so tests can mock the clock.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
