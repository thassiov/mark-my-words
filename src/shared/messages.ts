import type { Snippet, SnippetEdit, SnippetInput } from './types.js';

// ---------------------------------------------------------------------------
// Push events — SW → extension pages (opposite direction to commands)
// ---------------------------------------------------------------------------

/** Broadcast from the service worker after any snippet mutation. */
export type SnippetEvent =
  | { type: 'snippet:created'; snippet: Snippet }
  | { type: 'snippet:deleted'; id: string }
  | { type: 'snippet:updated'; snippet: Snippet };

export function isSnippetEvent(v: unknown): v is SnippetEvent {
  if (typeof v !== 'object' || v === null) return false;
  const t = (v as Record<string, unknown>)['type'];
  return t === 'snippet:created' || t === 'snippet:deleted' || t === 'snippet:updated';
}

// ---------------------------------------------------------------------------
// Commands — extension pages → SW
// ---------------------------------------------------------------------------

/**
 * Message envelopes exchanged between extension contexts (content script,
 * popup, options page, service worker).
 *
 * Each variant has a string `type` discriminator. New message types are
 * added here; the dispatcher's exhaustive switch then enforces that
 * every variant has a handler.
 *
 * Pure types only — no runtime imports of `webextension-polyfill`. The
 * browser-side wrapper {@link send} lives in `send.ts` so test
 * environments that don't have the extension APIs can still import this
 * module.
 */
export type Message =
  | { type: 'snippet:save'; payload: SnippetInput }
  | { type: 'snippet:list'; payload?: { limit?: number; offset?: number } }
  | { type: 'snippet:count' }
  | { type: 'snippet:delete'; payload: { id: string } }
  | { type: 'snippet:update'; payload: { id: string; edit: SnippetEdit } };

/**
 * Maps a message type to its expected response shape.
 */
export type Response<T extends Message['type']> = T extends 'snippet:save'
  ? Snippet
  : T extends 'snippet:list'
    ? Snippet[]
    : T extends 'snippet:count'
      ? number
      : T extends 'snippet:delete'
        ? null
        : T extends 'snippet:update'
          ? Snippet
          : never;

/**
 * Runtime-side guard. Cheap structural check; the real type-safety is
 * compile-time via the discriminated union. We only verify what's needed
 * to dispatch — handlers can validate their own payloads further.
 */
export function isMessage(v: unknown): v is Message {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  const t = obj['type'];
  if (typeof t !== 'string') return false;
  return (
    t === 'snippet:save' ||
    t === 'snippet:list' ||
    t === 'snippet:count' ||
    t === 'snippet:delete' ||
    t === 'snippet:update'
  );
}
