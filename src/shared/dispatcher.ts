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
 * Each case is exhaustive over {@link Message}; adding a new variant
 * to the union without a case here is a compile-time error. The
 * routing is split into per-group helpers (`dispatchRecord`,
 * `dispatchTag`) so each helper's branch count stays under the
 * configured complexity gate.
 */
export function createDispatcher(deps: DispatcherDeps): Dispatcher {
  return async (raw: unknown): Promise<unknown> => {
    if (!isMessage(raw)) throw new UnknownMessageError(raw);
    return raw.type.startsWith('tag:') ? dispatchTag(deps, raw) : dispatchRecord(deps, raw);
  };
}

async function dispatchRecord(deps: DispatcherDeps, msg: Message): Promise<unknown> {
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
    case 'record:add-note': {
      return deps.records.addNote(msg.payload.id, msg.payload.text);
    }
    case 'record:edit-note': {
      return deps.records.editNote(msg.payload.id, msg.payload.noteId, msg.payload.text);
    }
    case 'record:delete-note': {
      return deps.records.deleteNote(msg.payload.id, msg.payload.noteId);
    }
    default: {
      throw new UnknownMessageError(msg);
    }
  }
}

async function dispatchTag(deps: DispatcherDeps, msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'tag:list': {
      return deps.records.listAllTags();
    }
    case 'tag:rename': {
      return deps.records.renameTag(msg.payload.from, msg.payload.to);
    }
    case 'tag:merge': {
      return deps.records.mergeTag(msg.payload.from, msg.payload.into);
    }
    case 'tag:delete': {
      return deps.records.deleteTag(msg.payload.name);
    }
    default: {
      throw new UnknownMessageError(msg);
    }
  }
}
