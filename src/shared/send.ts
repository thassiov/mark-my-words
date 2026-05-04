import type { Message, Response } from './messages.js';

/**
 * Wire-protocol envelope returned by the service worker's
 * `runtime.onMessage` handler. We use this so a thrown error in the
 * dispatcher becomes a rejected Promise on the sender side, instead of
 * a silently-resolved-undefined which is what raw `chrome.runtime.sendMessage`
 * gives you when the listener doesn't respond.
 */
interface Envelope<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

/**
 * Send a message to the service worker and await its response.
 *
 * Used by content scripts, popup, and options page. Service-worker code
 * must not call this — the SW is the receiver, not a sender.
 */
export async function send<M extends Message>(msg: M): Promise<Response<M['type']>> {
  const env = (await chrome.runtime.sendMessage(msg)) as Envelope<Response<M['type']>> | undefined;
  if (env === undefined) {
    throw new Error('No response from service worker');
  }
  if (!env.ok) {
    throw new Error(env.error ?? 'Unknown error from service worker');
  }
  return env.value as Response<M['type']>;
}
