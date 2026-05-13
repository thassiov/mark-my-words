import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { Message } from '../shared/messages.js';
import type { Record, Selection } from '../shared/types.js';

import { broadcastRecordEvent, emitRecordEvent, recordEventForMessage } from './broadcast.js';
import type { ChromeApi } from './chrome-api.js';

function selection(overrides: Partial<Selection> = {}): Selection {
  return {
    type: 'selection',
    id: 'r1',
    selectedText: 'hello',
    contextBefore: '',
    contextAfter: '',
    sourceUrl: 'https://example.com',
    pageTitle: 'Example',
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('recordEventForMessage', () => {
  it('maps save-selection and save-page to record:created', () => {
    const rec = selection();
    expect(recordEventForMessage({ type: 'record:save-selection' } as Message, rec)).toEqual({
      type: 'record:created',
      record: rec,
    });
    expect(recordEventForMessage({ type: 'record:save-page' } as Message, rec)).toEqual({
      type: 'record:created',
      record: rec,
    });
  });

  it('maps record:delete to record:deleted with the id', () => {
    expect(
      recordEventForMessage({ type: 'record:delete', payload: { id: 'r9' } } as Message, null),
    ).toEqual({ type: 'record:deleted', id: 'r9' });
  });

  it.each([
    'record:update',
    'record:archive',
    'record:unarchive',
    'record:add-note',
    'record:edit-note',
    'record:delete-note',
  ] as const)('maps %s to record:updated', (type) => {
    const rec = selection();
    expect(recordEventForMessage({ type } as unknown as Message, rec)).toEqual({
      type: 'record:updated',
      record: rec,
    });
  });

  it('returns null for non-fan-out message types', () => {
    expect(recordEventForMessage({ type: 'record:list' } as Message, [])).toBeNull();
    expect(recordEventForMessage({ type: 'record:count' } as Message, 0)).toBeNull();
  });
});

describe('emitRecordEvent', () => {
  it('forwards the event verbatim to chrome.runtime.sendMessage', () => {
    const chromeApi = mock<ChromeApi>();
    chromeApi.sendRuntimeMessage.mockResolvedValue(undefined);
    const rec: Record = selection();
    emitRecordEvent(chromeApi, { type: 'record:created', record: rec });
    expect(chromeApi.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'record:created',
      record: rec,
    });
  });

  it('swallows "no receiver" rejections without logging', async () => {
    const chromeApi = mock<ChromeApi>();
    chromeApi.sendRuntimeMessage.mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    emitRecordEvent(chromeApi, { type: 'record:deleted', id: 'r1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs unexpected broadcast errors', async () => {
    const chromeApi = mock<ChromeApi>();
    chromeApi.sendRuntimeMessage.mockRejectedValue(new Error('something else'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    emitRecordEvent(chromeApi, { type: 'record:deleted', id: 'r1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('broadcastRecordEvent', () => {
  it('emits when the message type maps to an event', () => {
    const chromeApi = mock<ChromeApi>();
    chromeApi.sendRuntimeMessage.mockResolvedValue(undefined);
    const rec = selection();
    broadcastRecordEvent(chromeApi, { type: 'record:save-selection' } as Message, rec);
    expect(chromeApi.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'record:created',
      record: rec,
    });
  });

  it('no-ops for non-fan-out message types', () => {
    const chromeApi = mock<ChromeApi>();
    broadcastRecordEvent(chromeApi, { type: 'record:list' } as Message, []);
    expect(chromeApi.sendRuntimeMessage).not.toHaveBeenCalled();
  });
});
