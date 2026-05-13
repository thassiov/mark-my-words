import type { Record } from '../../shared/types.js';

/**
 * Sort comparator for library / archived views. Newest first in either
 * view; archived sorts by `archivedAt`, active by `createdAt`. Ties
 * break on `id` (also ULID-derived, so still time-ordered).
 */
export function compareForView(a: Record, b: Record, archived: boolean): number {
  if (archived) {
    const aa = a.archivedAt ?? '';
    const bb = b.archivedAt ?? '';
    if (aa !== bb) return aa < bb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}
