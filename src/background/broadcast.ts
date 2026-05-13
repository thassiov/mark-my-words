import type { Message, RecordEvent } from '../shared/messages.js';
import type { Record } from '../shared/types.js';

import type { ChromeApi } from './chrome-api.js';

/**
 * Push a RecordEvent to any open extension pages (e.g. the Library).
 * "No listener" is the common case (no Library tab open) — swallow that
 * one specifically. Real errors are logged so they don't disappear
 * silently.
 */
export function emitRecordEvent(chromeApi: ChromeApi, event: RecordEvent): void {
  chromeApi.sendRuntimeMessage(event).catch((err: unknown) => {
    if (isNoReceiverError(err)) return;
    console.warn('[mark-my-words] broadcast failed:', err);
  });
}

function isNoReceiverError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Chrome's exact phrasing varies across versions; match the common substrings.
  return /receiving end does not exist|could not establish connection/i.test(err.message);
}

/**
 * Translate a successfully-dispatched message into the RecordEvents its
 * UI listeners expect. Returns an empty array for types that don't fan
 * out (e.g. `record:list`, `record:count`, `tag:list`).
 *
 * Most message types yield exactly one event. Tag CRUD operations
 * (`tag:rename`, `tag:merge`, `tag:delete`) yield one `record:updated`
 * per touched record — the dispatcher returns the touched array and we
 * unroll it here.
 */
export function recordEventsForMessage(msg: Message, value: unknown): RecordEvent[] {
  switch (msg.type) {
    case 'record:save-selection':
    case 'record:save-page': {
      return [{ type: 'record:created', record: value as Record }];
    }
    case 'record:delete': {
      return [{ type: 'record:deleted', id: msg.payload.id }];
    }
    case 'record:update':
    case 'record:archive':
    case 'record:unarchive':
    case 'record:add-note':
    case 'record:edit-note':
    case 'record:delete-note': {
      return [{ type: 'record:updated', record: value as Record }];
    }
    case 'tag:rename':
    case 'tag:merge':
    case 'tag:delete': {
      const touched = (value ?? []) as Record[];
      return touched.map((record) => ({ type: 'record:updated', record }));
    }
    default: {
      return [];
    }
  }
}

/**
 * Send the appropriate RecordEvent(s) for a successfully-dispatched
 * message, or no-op if the message type doesn't fan out.
 */
export function broadcastRecordEvent(chromeApi: ChromeApi, msg: Message, value: unknown): void {
  for (const event of recordEventsForMessage(msg, value)) {
    emitRecordEvent(chromeApi, event);
  }
}
