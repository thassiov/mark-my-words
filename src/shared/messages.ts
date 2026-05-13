import type { Page, PageInput, Record, RecordEdit, Selection, SelectionInput } from './types.js';

// ---------------------------------------------------------------------------
// Push events — SW → extension pages (opposite direction to commands)
// ---------------------------------------------------------------------------

/** Broadcast from the service worker after any record mutation. */
export type RecordEvent =
  | { type: 'record:created'; record: Record }
  | { type: 'record:deleted'; id: string }
  | { type: 'record:updated'; record: Record };

export function isRecordEvent(v: unknown): v is RecordEvent {
  if (typeof v !== 'object' || v === null) return false;
  // Inline index signature instead of `Record<string, unknown>` — our
  // `Record` type shadows the TS utility within this file.
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  const t = (v as { [k: string]: unknown })['type'];
  return t === 'record:created' || t === 'record:deleted' || t === 'record:updated';
}

// ---------------------------------------------------------------------------
// Commands — extension pages → SW
// ---------------------------------------------------------------------------

/**
 * Message envelopes exchanged between extension contexts (content script,
 * popup, app page, service worker).
 *
 * Each variant has a string `type` discriminator. New message types are
 * added here; the dispatcher's exhaustive switch then enforces that
 * every variant has a handler.
 *
 * Pure types only — no runtime imports of `webextension-polyfill`. The
 * browser-side wrapper {@link send} lives in `send.ts` so test
 * environments that don't have the extension APIs can still import this
 * module.
 *
 * Note: `record:save-selection` / `record:save-page` exist for symmetry
 * but no consumer currently sends them — the service worker handles the
 * save end-to-end without going through the bus. They're kept so the
 * dispatcher's exhaustive switch covers the operation if a future caller
 * wants to drive a save from another context.
 */
export type Message =
  | { type: 'record:save-selection'; payload: SelectionInput }
  | { type: 'record:save-page'; payload: PageInput }
  | {
      type: 'record:list';
      payload?: { limit?: number; offset?: number; archived?: boolean };
    }
  | { type: 'record:count' }
  | { type: 'record:delete'; payload: { id: string } }
  | { type: 'record:update'; payload: { id: string; edit: RecordEdit } }
  | { type: 'record:archive'; payload: { id: string } }
  | { type: 'record:unarchive'; payload: { id: string } }
  | { type: 'record:add-note'; payload: { id: string; text: string } }
  | { type: 'record:edit-note'; payload: { id: string; noteId: string; text: string } }
  | { type: 'record:delete-note'; payload: { id: string; noteId: string } };

/**
 * Maps a message type to its expected response shape.
 */
export type Response<T extends Message['type']> = T extends 'record:save-selection'
  ? Selection
  : T extends 'record:save-page'
    ? Page
    : T extends 'record:list'
      ? Record[]
      : T extends 'record:count'
        ? number
        : T extends 'record:delete'
          ? null
          : T extends
                | 'record:update'
                | 'record:archive'
                | 'record:unarchive'
                | 'record:add-note'
                | 'record:edit-note'
                | 'record:delete-note'
            ? Record
            : never;

/**
 * Runtime-side guard. Cheap structural check; the real type-safety is
 * compile-time via the discriminated union. We only verify what's needed
 * to dispatch — handlers can validate their own payloads further.
 */
export function isMessage(v: unknown): v is Message {
  if (typeof v !== 'object' || v === null) return false;
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  const obj = v as { [k: string]: unknown };
  const t = obj['type'];
  if (typeof t !== 'string') return false;
  return (
    t === 'record:save-selection' ||
    t === 'record:save-page' ||
    t === 'record:list' ||
    t === 'record:count' ||
    t === 'record:delete' ||
    t === 'record:update' ||
    t === 'record:archive' ||
    t === 'record:unarchive' ||
    t === 'record:add-note' ||
    t === 'record:edit-note' ||
    t === 'record:delete-note'
  );
}
