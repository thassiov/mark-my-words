import type { Record } from '../../shared/types.js';

export function archiveLabel(busy: boolean, isArchived: boolean): string {
  if (busy) return '…';
  return isArchived ? 'Unarchive' : 'Archive';
}

export interface BuildSubtitleArgs {
  error: string | null;
  records: readonly Record[] | null;
  filteredLength: number;
  query: string;
  noun: string;
}

export function buildSubtitle({
  error,
  records,
  filteredLength,
  query,
  noun,
}: BuildSubtitleArgs): string {
  if (error !== null) return `Couldn't connect: ${error}`;
  if (records === null) return 'Loading…';
  if (query.trim() === '') {
    const word = records.length === 1 ? noun : `${noun}s`;
    return `${String(records.length)} ${word}.`;
  }
  return `${String(filteredLength)} of ${String(records.length)} shown.`;
}
