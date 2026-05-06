import { describe, expect, it, vi } from 'vitest';

import type { SnippetService } from '../snippets/snippet-service.js';

import { createDispatcher, UnknownMessageError } from './dispatcher.js';
import type { Snippet, SnippetInput } from './types.js';

function makeFakeService(): SnippetService & {
  save: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  unarchive: ReturnType<typeof vi.fn>;
} {
  const fake = {
    save: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
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

  describe('snippet:delete', () => {
    it('routes to snippets.delete with the id and returns null', async () => {
      const snippets = makeFakeService();
      snippets.delete.mockResolvedValue(undefined);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({ type: 'snippet:delete', payload: { id: 'id-0001' } });

      expect(snippets.delete).toHaveBeenCalledOnce();
      expect(snippets.delete).toHaveBeenCalledWith('id-0001');
      expect(result).toBeNull();
    });

    it('propagates rejection from the service', async () => {
      const snippets = makeFakeService();
      snippets.delete.mockRejectedValue(new Error('boom'));
      const dispatch = createDispatcher({ snippets });

      await expect(
        dispatch({ type: 'snippet:delete', payload: { id: 'id-0001' } }),
      ).rejects.toThrow('boom');
    });
  });

  describe('snippet:update', () => {
    it('routes to snippets.update with id and edit and returns the updated snippet', async () => {
      const snippets = makeFakeService();
      const updated = { ...fakeSnippet, note: 'edited note' };
      snippets.update.mockResolvedValue(updated);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({
        type: 'snippet:update',
        payload: { id: 'id-0001', edit: { note: 'edited note' } },
      });

      expect(snippets.update).toHaveBeenCalledOnce();
      expect(snippets.update).toHaveBeenCalledWith('id-0001', { note: 'edited note' });
      expect(result).toEqual(updated);
    });

    it('propagates rejection from the service', async () => {
      const snippets = makeFakeService();
      snippets.update.mockRejectedValue(new Error('not found'));
      const dispatch = createDispatcher({ snippets });

      await expect(
        dispatch({ type: 'snippet:update', payload: { id: 'x', edit: {} } }),
      ).rejects.toThrow('not found');
    });
  });

  describe('snippet:archive', () => {
    it('routes to snippets.archive with the id', async () => {
      const snippets = makeFakeService();
      const archived = { ...fakeSnippet, archivedAt: '2026-05-04T13:00:00.000Z' };
      snippets.archive.mockResolvedValue(archived);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({ type: 'snippet:archive', payload: { id: 'id-0001' } });

      expect(snippets.archive).toHaveBeenCalledOnce();
      expect(snippets.archive).toHaveBeenCalledWith('id-0001');
      expect(result).toEqual(archived);
    });

    it('propagates rejection from the service', async () => {
      const snippets = makeFakeService();
      snippets.archive.mockRejectedValue(new Error('not found'));
      const dispatch = createDispatcher({ snippets });

      await expect(dispatch({ type: 'snippet:archive', payload: { id: 'x' } })).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('snippet:unarchive', () => {
    it('routes to snippets.unarchive with the id', async () => {
      const snippets = makeFakeService();
      snippets.unarchive.mockResolvedValue(fakeSnippet);
      const dispatch = createDispatcher({ snippets });

      const result = await dispatch({ type: 'snippet:unarchive', payload: { id: 'id-0001' } });

      expect(snippets.unarchive).toHaveBeenCalledOnce();
      expect(snippets.unarchive).toHaveBeenCalledWith('id-0001');
      expect(result).toEqual(fakeSnippet);
    });

    it('propagates rejection from the service', async () => {
      const snippets = makeFakeService();
      snippets.unarchive.mockRejectedValue(new Error('not found'));
      const dispatch = createDispatcher({ snippets });

      await expect(dispatch({ type: 'snippet:unarchive', payload: { id: 'x' } })).rejects.toThrow(
        'not found',
      );
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
