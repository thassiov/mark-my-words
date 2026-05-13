import type { Message, Response } from './messages.js';

/**
 * Wire-protocol envelope returned by the service worker's
 * `runtime.onMessage` handler. We use this so a thrown error in the
 * dispatcher becomes a rejected Promise on the sender side, instead of
 * a silently-resolved-undefined which is what raw `chrome.runtime.sendMessage`
 * gives you when the listener doesn't respond.
 *
 * Discriminated by `ok` so that after a `!ok` early-return, `value` is
 * narrowed to `T` (no non-null assertion needed at the call site).
 */
type Envelope<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Send a message to the service worker and await its response.
 *
 * Used by content scripts, popup, and app page. Service-worker code
 * must not call this — the SW is the receiver, not a sender.
 */
export async function send<M extends Message>(msg: M): Promise<Response<M['type']>> {
  const env = (await chrome.runtime.sendMessage(msg)) as Envelope<Response<M['type']>> | undefined;
  if (env === undefined) {
    throw new Error('No response from service worker');
  }
  if (!env.ok) {
    throw new Error(env.error);
  }
  return env.value;
}
