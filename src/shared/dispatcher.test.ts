import { describe, expect, it, vi } from 'vitest';

import type { RecordService } from '../records/record-service.js';

import { createDispatcher, UnknownMessageError } from './dispatcher.js';
import type { Record, SelectionInput } from './types.js';

function makeFakeService(): RecordService & {
  saveSelection: ReturnType<typeof vi.fn>;
  savePage: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  unarchive: ReturnType<typeof vi.fn>;
} {
  const fake = {
    saveSelection: vi.fn(),
    savePage: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
  };
  return fake as unknown as RecordService & typeof fake;
}

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

describe('createDispatcher', () => {
  describe('record:save-selection', () => {
    it('routes to records.saveSelection with the payload', async () => {
      const records = makeFakeService();
      records.saveSelection.mockResolvedValue(fakeRecord);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({ type: 'record:save-selection', payload: baseInput });

      expect(records.saveSelection).toHaveBeenCalledOnce();
      expect(records.saveSelection).toHaveBeenCalledWith(baseInput);
      expect(result).toEqual(fakeRecord);
    });

    it('propagates rejection from the service', async () => {
      const records = makeFakeService();
      records.saveSelection.mockRejectedValue(new Error('boom'));
      const dispatch = createDispatcher({ records });

      await expect(dispatch({ type: 'record:save-selection', payload: baseInput })).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('record:save-page', () => {
    it('routes to records.savePage with the payload', async () => {
      const records = makeFakeService();
      const fakePage: Record = {
        type: 'page',
        id: 'id-page-1',
        sourceUrl: 'https://example.com',
        pageTitle: 'Example',
        createdAt: '2026-05-04T12:00:00.000Z',
        updatedAt: '2026-05-04T12:00:00.000Z',
      };
      records.savePage.mockResolvedValue(fakePage);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({
        type: 'record:save-page',
        payload: { sourceUrl: 'https://example.com', pageTitle: 'Example' },
      });

      expect(records.savePage).toHaveBeenCalledOnce();
      expect(result).toEqual(fakePage);
    });
  });

  describe('record:list', () => {
    it('routes with no payload', async () => {
      const records = makeFakeService();
      records.list.mockResolvedValue([fakeRecord]);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({ type: 'record:list' });

      expect(records.list).toHaveBeenCalledOnce();
      expect(records.list).toHaveBeenCalledWith({});
      expect(result).toEqual([fakeRecord]);
    });

    it('forwards limit/offset payload', async () => {
      const records = makeFakeService();
      records.list.mockResolvedValue([]);
      const dispatch = createDispatcher({ records });

      await dispatch({ type: 'record:list', payload: { limit: 5, offset: 2 } });

      expect(records.list).toHaveBeenCalledWith({ limit: 5, offset: 2 });
    });
  });

  describe('record:count', () => {
    it('routes to records.count', async () => {
      const records = makeFakeService();
      records.count.mockResolvedValue(42);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({ type: 'record:count' });

      expect(records.count).toHaveBeenCalledOnce();
      expect(result).toBe(42);
    });
  });

  describe('record:delete', () => {
    it('routes to records.delete with the id and returns null', async () => {
      const records = makeFakeService();
      records.delete.mockResolvedValue(undefined);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({ type: 'record:delete', payload: { id: 'id-0001' } });

      expect(records.delete).toHaveBeenCalledOnce();
      expect(records.delete).toHaveBeenCalledWith('id-0001');
      expect(result).toBeNull();
    });

    it('propagates rejection from the service', async () => {
      const records = makeFakeService();
      records.delete.mockRejectedValue(new Error('boom'));
      const dispatch = createDispatcher({ records });

      await expect(dispatch({ type: 'record:delete', payload: { id: 'id-0001' } })).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('record:update', () => {
    it('routes to records.update with id and edit and returns the updated record', async () => {
      const records = makeFakeService();
      const updated = { ...fakeRecord, note: 'edited note' };
      records.update.mockResolvedValue(updated);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({
        type: 'record:update',
        payload: { id: 'id-0001', edit: { note: 'edited note' } },
      });

      expect(records.update).toHaveBeenCalledOnce();
      expect(records.update).toHaveBeenCalledWith('id-0001', { note: 'edited note' });
      expect(result).toEqual(updated);
    });

    it('propagates rejection from the service', async () => {
      const records = makeFakeService();
      records.update.mockRejectedValue(new Error('not found'));
      const dispatch = createDispatcher({ records });

      await expect(
        dispatch({ type: 'record:update', payload: { id: 'x', edit: {} } }),
      ).rejects.toThrow('not found');
    });
  });

  describe('record:archive', () => {
    it('routes to records.archive with the id', async () => {
      const records = makeFakeService();
      const archived = { ...fakeRecord, archivedAt: '2026-05-04T13:00:00.000Z' };
      records.archive.mockResolvedValue(archived);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({ type: 'record:archive', payload: { id: 'id-0001' } });

      expect(records.archive).toHaveBeenCalledOnce();
      expect(records.archive).toHaveBeenCalledWith('id-0001');
      expect(result).toEqual(archived);
    });

    it('propagates rejection from the service', async () => {
      const records = makeFakeService();
      records.archive.mockRejectedValue(new Error('not found'));
      const dispatch = createDispatcher({ records });

      await expect(dispatch({ type: 'record:archive', payload: { id: 'x' } })).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('record:unarchive', () => {
    it('routes to records.unarchive with the id', async () => {
      const records = makeFakeService();
      records.unarchive.mockResolvedValue(fakeRecord);
      const dispatch = createDispatcher({ records });

      const result = await dispatch({ type: 'record:unarchive', payload: { id: 'id-0001' } });

      expect(records.unarchive).toHaveBeenCalledOnce();
      expect(records.unarchive).toHaveBeenCalledWith('id-0001');
      expect(result).toEqual(fakeRecord);
    });

    it('propagates rejection from the service', async () => {
      const records = makeFakeService();
      records.unarchive.mockRejectedValue(new Error('not found'));
      const dispatch = createDispatcher({ records });

      await expect(dispatch({ type: 'record:unarchive', payload: { id: 'x' } })).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('unknown / malformed', () => {
    it('throws on an unknown type', async () => {
      const records = makeFakeService();
      const dispatch = createDispatcher({ records });
      await expect(dispatch({ type: 'record:nope' })).rejects.toBeInstanceOf(UnknownMessageError);
    });

    it('throws on a non-object message', async () => {
      const records = makeFakeService();
      const dispatch = createDispatcher({ records });
      await expect(dispatch('hello')).rejects.toBeInstanceOf(UnknownMessageError);
      await expect(dispatch(null)).rejects.toBeInstanceOf(UnknownMessageError);
      await expect(dispatch(123)).rejects.toBeInstanceOf(UnknownMessageError);
    });

    it('throws on a missing type field', async () => {
      const records = makeFakeService();
      const dispatch = createDispatcher({ records });
      await expect(dispatch({ payload: 'whatever' })).rejects.toBeInstanceOf(UnknownMessageError);
    });

    it('does not call any service handler on bad input', async () => {
      const records = makeFakeService();
      const dispatch = createDispatcher({ records });
      await expect(dispatch({ type: 'bogus' })).rejects.toBeInstanceOf(UnknownMessageError);
      expect(records.saveSelection).not.toHaveBeenCalled();
      expect(records.savePage).not.toHaveBeenCalled();
      expect(records.list).not.toHaveBeenCalled();
      expect(records.count).not.toHaveBeenCalled();
    });
  });
});
