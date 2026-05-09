import type { RecordService } from '../records/record-service.js';

import { isMessage, type Message } from './messages.js';

export class UnknownMessageError extends Error {
  constructor(received: unknown) {
    super(`Unknown or malformed message: ${JSON.stringify(received)}`);
    this.name = 'UnknownMessageError';
  }
}

export interface DispatcherDeps {
  records: RecordService;
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
      case 'record:save-selection': {
        return deps.records.saveSelection(msg.payload);
      }
      case 'record:save-page': {
        return deps.records.savePage(msg.payload);
      }
      case 'record:list': {
        return deps.records.list(msg.payload ?? {});
      }
      case 'record:count': {
        return deps.records.count();
      }
      case 'record:delete': {
        await deps.records.delete(msg.payload.id);
        return null;
      }
      case 'record:update': {
        return deps.records.update(msg.payload.id, msg.payload.edit);
      }
      case 'record:archive': {
        return deps.records.archive(msg.payload.id);
      }
      case 'record:unarchive': {
        return deps.records.unarchive(msg.payload.id);
      }
      default: {
        // Exhaustiveness check — fails to compile if a Message variant is missing above.
        const _exhaustive: never = msg;
        throw new UnknownMessageError(_exhaustive);
      }
    }
  };
}
