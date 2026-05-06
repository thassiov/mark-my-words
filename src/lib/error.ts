/**
 * Pull a human message out of an `unknown` thrown value. Errors keep
 * their `.message`; everything else gets `String()`'d. Use this at the
 * boundary where exceptions become user-visible strings.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
