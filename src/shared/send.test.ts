import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Snippet, SnippetInput } from './types.js';

import { send } from './send.js';

const baseInput: SnippetInput = {
  selectedText: 'hello',
  contextBefore: '',
  contextAfter: '',
  sourceUrl: 'https://example.com',
  pageTitle: 'Example',
};

const fakeSnippet: Snippet = {
  ...baseInput,
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
    sendMessage.mockResolvedValue({ ok: true, value: fakeSnippet });
    const result = await send({ type: 'snippet:save', payload: baseInput });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'snippet:save', payload: baseInput });
    expect(result).toEqual(fakeSnippet);
  });

  it('forwards list payload', async () => {
    sendMessage.mockResolvedValue({ ok: true, value: [] });
    await send({ type: 'snippet:list', payload: { limit: 5 } });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'snippet:list', payload: { limit: 5 } });
  });

  it('returns the unwrapped value typed by Response<T>', async () => {
    sendMessage.mockResolvedValue({ ok: true, value: 7 });
    const n = await send({ type: 'snippet:count' });
    expect(n).toBe(7);
  });

  it('rejects when the envelope is not ok', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'no handler' });
    await expect(send({ type: 'snippet:count' })).rejects.toThrow('no handler');
  });

  it('rejects when no response is returned (undefined)', async () => {
    sendMessage.mockResolvedValue(undefined);
    await expect(send({ type: 'snippet:count' })).rejects.toThrow(
      'No response from service worker',
    );
  });

  it('propagates rejection from runtime.sendMessage', async () => {
    sendMessage.mockRejectedValue(new Error('connection lost'));
    await expect(send({ type: 'snippet:count' })).rejects.toThrow('connection lost');
  });
});
