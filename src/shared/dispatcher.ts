import type { SnippetService } from '../snippets/snippet-service.js';

import { isMessage, type Message } from './messages.js';

export class UnknownMessageError extends Error {
  constructor(received: unknown) {
    super(`Unknown or malformed message: ${JSON.stringify(received)}`);
    this.name = 'UnknownMessageError';
  }
}

export interface DispatcherDeps {
  snippets: SnippetService;
}

/**
 * The signature `runtime.onMessage` listeners use under
 * `webextension-polyfill`: any incoming value, and we return either a
 * value or a Promise of a value. Throws are propagated back to the
 * sender as rejections.
 */
export type Dispatcher = (message: unknown) => Promise<unknown>;

/**
 * Build the message dispatcher used by the service worker.
 *
 * Each `case` is exhaustive over {@link Message}; adding a new variant
 * to the union without a case here is a compile-time error.
 */
export function createDispatcher(deps: DispatcherDeps): Dispatcher {
  return async (raw: unknown): Promise<unknown> => {
    if (!isMessage(raw)) {
      throw new UnknownMessageError(raw);
    }
    const msg: Message = raw;
    switch (msg.type) {
      case 'snippet:save':
        return deps.snippets.save(msg.payload);
      case 'snippet:list':
        return deps.snippets.list(msg.payload ?? {});
      case 'snippet:count':
        return deps.snippets.count();
      default: {
        // Exhaustiveness check — fails to compile if a Message variant is missing above.
        const _exhaustive: never = msg;
        throw new UnknownMessageError(_exhaustive);
      }
    }
  };
}
