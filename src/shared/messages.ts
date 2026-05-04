import type { Snippet, SnippetInput } from './types.js';

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
  | { type: 'snippet:count' };

/**
 * Maps a message type to its expected response shape.
 */
export type Response<T extends Message['type']> = T extends 'snippet:save'
  ? Snippet
  : T extends 'snippet:list'
    ? Snippet[]
    : T extends 'snippet:count'
      ? number
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
  return t === 'snippet:save' || t === 'snippet:list' || t === 'snippet:count';
}
