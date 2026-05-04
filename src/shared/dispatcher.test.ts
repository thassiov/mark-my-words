import { describe, expect, it, vi } from 'vitest';

import type { SnippetService } from '../snippets/snippet-service.js';
import type { Snippet, SnippetInput } from './types.js';

import { createDispatcher, UnknownMessageError } from './dispatcher.js';

function makeFakeService(): SnippetService & {
  save: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
} {
  const fake = {
    save: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
  };
  return fake as unknown as SnippetService & typeof fake;
}

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

describe('createDispatcher', () => {
  describe('snippet:save', () => {
    it('routes to snippets.save with the payload', async () => {
      const snippets = makeFakeService();
      snippets.save.mockResolvedValue(fakeSnippet);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({ type: 'snippet:save', payload: baseInput });

      expect(snippets.save).toHaveBeenCalledOnce();
      expect(snippets.save).toHaveBeenCalledWith(baseInput);
      expect(result).toEqual(fakeSnippet);
    });

    it('propagates rejection from the service', async () => {
      const snippets = makeFakeService();
      snippets.save.mockRejectedValue(new Error('boom'));
      const dispatch = createDispatcher({ snippets });

      await expect(dispatch({ type: 'snippet:save', payload: baseInput })).rejects.toThrow('boom');
    });
  });

  describe('snippet:list', () => {
    it('routes with no payload', async () => {
      const snippets = makeFakeService();
      snippets.list.mockResolvedValue([fakeSnippet]);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({ type: 'snippet:list' });

      expect(snippets.list).toHaveBeenCalledOnce();
      expect(snippets.list).toHaveBeenCalledWith({});
      expect(result).toEqual([fakeSnippet]);
    });

    it('forwards limit/offset payload', async () => {
      const snippets = makeFakeService();
      snippets.list.mockResolvedValue([]);
      const dispatch = createDispatcher({ snippets });

      await dispatch({ type: 'snippet:list', payload: { limit: 5, offset: 2 } });

      expect(snippets.list).toHaveBeenCalledWith({ limit: 5, offset: 2 });
    });
  });

  describe('snippet:count', () => {
    it('routes to snippets.count', async () => {
      const snippets = makeFakeService();
      snippets.count.mockResolvedValue(42);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({ type: 'snippet:count' });

      expect(snippets.count).toHaveBeenCalledOnce();
      expect(result).toBe(42);
    });
  });

  describe('unknown / malformed', () => {
    it('throws on an unknown type', async () => {
      const snippets = makeFakeService();
      const dispatch = createDispatcher({ snippets });
      await expect(dispatch({ type: 'snippet:nope' })).rejects.toBeInstanceOf(UnknownMessageError);
    });

    it('throws on a non-object message', async () => {
      const snippets = makeFakeService();
      const dispatch = createDispatcher({ snippets });
      await expect(dispatch('hello')).rejects.toBeInstanceOf(UnknownMessageError);
      await expect(dispatch(null)).rejects.toBeInstanceOf(UnknownMessageError);
      await expect(dispatch(123)).rejects.toBeInstanceOf(UnknownMessageError);
    });

    it('throws on a missing type field', async () => {
      const snippets = makeFakeService();
      const dispatch = createDispatcher({ snippets });
      await expect(dispatch({ payload: 'whatever' })).rejects.toBeInstanceOf(UnknownMessageError);
    });

    it('does not call any service handler on bad input', async () => {
      const snippets = makeFakeService();
      const dispatch = createDispatcher({ snippets });
      await expect(dispatch({ type: 'bogus' })).rejects.toBeInstanceOf(UnknownMessageError);
      expect(snippets.save).not.toHaveBeenCalled();
      expect(snippets.list).not.toHaveBeenCalled();
      expect(snippets.count).not.toHaveBeenCalled();
    });
  });
});
