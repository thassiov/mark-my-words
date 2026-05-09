import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { send } from './send.js';
import type { Record, SelectionInput } from './types.js';

const baseInput: SelectionInput = {
  selectedText: 'hello',
  contextBefore: '',
  contextAfter: '',
  sourceUrl: 'https://example.com',
  pageTitle: 'Example',
};

const fakeRecord: Record = {
  ...baseInput,
  type: 'selection',
  id: 'id-0001',
  createdAt: '2026-05-04T12:00:00.000Z',
  updatedAt: '2026-05-04T12:00:00.000Z',
};

describe('send', () => {
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the message and unwraps an ok envelope', async () => {
    sendMessage.mockResolvedValue({ ok: true, value: fakeRecord });
    const result = await send({ type: 'record:save-selection', payload: baseInput });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'record:save-selection',
      payload: baseInput,
    });
    expect(result).toEqual(fakeRecord);
  });

  it('forwards list payload', async () => {
    sendMessage.mockResolvedValue({ ok: true, value: [] });
    await send({ type: 'record:list', payload: { limit: 5 } });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'record:list', payload: { limit: 5 } });
  });

  it('returns the unwrapped value typed by Response<T>', async () => {
    sendMessage.mockResolvedValue({ ok: true, value: 7 });
    const n = await send({ type: 'record:count' });
    expect(n).toBe(7);
  });

  it('rejects when the envelope is not ok', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'no handler' });
    await expect(send({ type: 'record:count' })).rejects.toThrow('no handler');
  });

  it('rejects when no response is returned (undefined)', async () => {
    sendMessage.mockResolvedValue(undefined);
    await expect(send({ type: 'record:count' })).rejects.toThrow('No response from service worker');
  });

  it('propagates rejection from runtime.sendMessage', async () => {
    sendMessage.mockRejectedValue(new Error('connection lost'));
    await expect(send({ type: 'record:count' })).rejects.toThrow('connection lost');
  });
});
