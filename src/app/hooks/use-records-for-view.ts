import { useCallback, useEffect, useState } from 'preact/hooks';

import { errorMessage } from '../../lib/error.js';
import { isRecordEvent, type RecordEvent } from '../../shared/messages.js';
import { send } from '../../shared/send.js';
import type { Record } from '../../shared/types.js';
import { compareForView } from '../lib/sort.js';

export interface UseRecordsForView {
  /** Loaded records for this view, or `null` while the first fetch is in-flight. */
  records: Record[] | null;
  /** Last error message from a fetch failure; `null` if healthy. */
  error: string | null;
  /** Drop a record from local state (called by the detail pane after a delete). */
  removeFromState: (id: string) => void;
  /** Replace a record in local state by id. No-op if not present. */
  patchInState: (updated: Record) => void;
}

/**
 * Encapsulates the list-state + reactivity for one of the library views
 * (active or archived). Wraps:
 *
 *  - initial fetch (`record:list { archived }`),
 *  - SW broadcast subscription (`record:created/updated/deleted`),
 *  - cross-view migration: when a `record:updated` flips a record's
 *    archive state, drop it from this view if it no longer matches and
 *    insert (sorted) when it just started matching.
 *
 * `onRecordDisappear` is fired when a record leaves this view (was
 * deleted, or migrated to the other view). The parent uses it to clear
 * the selection if the disappeared record was selected.
 */
export function useRecordsForView(
  archived: boolean,
  onRecordDisappear: (id: string) => void,
): UseRecordsForView {
  const [records, setRecords] = useState<Record[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecords(null);
    setError(null);
    send({ type: 'record:list', payload: { archived } })
      .then((items) => {
        setRecords(items);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
      });
  }, [archived]);

  useEffect(() => {
    const handler = (msg: unknown) => {
      if (isRecordEvent(msg)) applyEvent(msg, archived, setRecords, onRecordDisappear);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [archived, onRecordDisappear]);

  const removeFromState = useCallback((id: string) => {
    setRecords((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }, []);

  const patchInState = useCallback((updated: Record) => {
    setRecords((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
  }, []);

  return { records, error, removeFromState, patchInState };
}

type SetRecords = (updater: (prev: Record[] | null) => Record[] | null) => void;

function matchesView(record: Record, archived: boolean): boolean {
  return archived ? record.archivedAt !== undefined : record.archivedAt === undefined;
}

function insertSorted(prev: Record[] | null, record: Record, archived: boolean): Record[] {
  const next = prev === null ? [record] : [...prev, record];
  next.sort((a, b) => compareForView(a, b, archived));
  return next;
}

function applyCreated(record: Record, archived: boolean, setRecords: SetRecords): void {
  if (!matchesView(record, archived)) return;
  setRecords((prev) => insertSorted(prev, record, archived));
}

function applyDeleted(
  id: string,
  setRecords: SetRecords,
  onRecordDisappear: (id: string) => void,
): void {
  setRecords((prev) => prev?.filter((s) => s.id !== id) ?? null);
  onRecordDisappear(id);
}

function applyUpdated(
  updated: Record,
  archived: boolean,
  setRecords: SetRecords,
  onRecordDisappear: (id: string) => void,
): void {
  setRecords((prev) => mergeUpdated(prev, updated, archived, onRecordDisappear));
}

function mergeUpdated(
  prev: Record[] | null,
  updated: Record,
  archived: boolean,
  onRecordDisappear: (id: string) => void,
): Record[] | null {
  if (prev === null) return null;
  const exists = prev.some((s) => s.id === updated.id);
  if (matchesView(updated, archived)) {
    const next = exists ? prev.map((s) => (s.id === updated.id ? updated : s)) : [...prev, updated];
    next.sort((a, b) => compareForView(a, b, archived));
    return next;
  }
  if (!exists) return prev;
  onRecordDisappear(updated.id);
  return prev.filter((s) => s.id !== updated.id);
}

function applyEvent(
  msg: RecordEvent,
  archived: boolean,
  setRecords: SetRecords,
  onRecordDisappear: (id: string) => void,
): void {
  if (msg.type === 'record:created') {
    applyCreated(msg.record, archived, setRecords);
    return;
  }
  if (msg.type === 'record:deleted') {
    applyDeleted(msg.id, setRecords, onRecordDisappear);
    return;
  }
  applyUpdated(msg.record, archived, setRecords, onRecordDisappear);
}
