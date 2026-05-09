import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Selection } from '../shared/types.js';

import { IdbRepo } from './idb-repo.js';

function baseSelection(overrides: Partial<Selection> = {}): Selection {
  return {
    type: 'selection',
    id: 'id-0001',
    selectedText: 'hello',
    contextBefore: '',
    contextAfter: '',
    sourceUrl: 'https://example.com',
    pageTitle: 'Example',
    createdAt: '2026-05-04T12:00:00.000Z',
    updatedAt: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

function expectSelection(value: unknown): asserts value is Selection {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { type?: string }).type !== 'selection'
  ) {
    throw new Error('expected a Selection record');
  }
}

describe('IdbRepo', () => {
  let repo: IdbRepo;
  let dbName: string;

  beforeEach(() => {
    // Fresh DB per test so state doesn't leak.
    dbName = `mmw-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    repo = new IdbRepo(dbName);
  });

  afterEach(() => {
    // Cleanup: deleteDatabase fires-and-forgets — the request resolves
    // via onsuccess, but the test doesn't need to wait. Each test uses
    // a fresh, time-stamped dbName so reuse isn't a concern.
    indexedDB.deleteDatabase(dbName);
  });

  describe('put + getById', () => {
    it('round-trips an item', async () => {
      const s = baseSelection({ selectedText: 'hi' });
      await repo.put(s);
      expect(await repo.getById(s.id)).toEqual(s);
    });

    it('overwrites on second put with same id', async () => {
      const a = baseSelection({ selectedText: 'first' });
      await repo.put(a);
      await repo.put({ ...a, selectedText: 'second' });
      const got = await repo.getById(a.id);
      expectSelection(got);
      expect(got.selectedText).toBe('second');
    });

    it('returns null for an unknown id', async () => {
      expect(await repo.getById('missing')).toBeNull();
    });
  });

  describe('getAll', () => {
    it('returns empty array on a fresh DB', async () => {
      expect(await repo.getAll()).toEqual([]);
    });

    it('returns all items', async () => {
      await repo.put(baseSelection({ id: 'a', selectedText: 'one' }));
      await repo.put(baseSelection({ id: 'b', selectedText: 'two' }));
      const all = await repo.getAll();
      expect(all).toHaveLength(2);
      const texts = all.map((i) => (i.type === 'selection' ? i.selectedText : '')).toSorted();
      expect(texts).toEqual(['one', 'two']);
    });
  });

  describe('delete', () => {
    it('removes an item', async () => {
      const s = baseSelection();
      await repo.put(s);
      await repo.delete(s.id);
      expect(await repo.getById(s.id)).toBeNull();
    });

    it('is a no-op for an unknown id', async () => {
      await expect(repo.delete('missing')).resolves.toBeUndefined();
    });
  });

  describe('count', () => {
    it('starts at 0', async () => {
      expect(await repo.count()).toBe(0);
    });

    it('reflects puts and deletes', async () => {
      await repo.put(baseSelection({ id: 'a' }));
      await repo.put(baseSelection({ id: 'b' }));
      expect(await repo.count()).toBe(2);
      await repo.delete('a');
      expect(await repo.count()).toBe(1);
    });
  });

  describe('large fields (screenshots)', () => {
    it('stores and retrieves a large data URL', async () => {
      const big = 'data:image/jpeg;base64,' + 'A'.repeat(200_000); // ~200 KB
      const s = baseSelection({ screenshotDataUrl: big });
      await repo.put(s);
      const got = await repo.getById(s.id);
      expect(got?.screenshotDataUrl).toHaveLength(big.length);
      expect(got?.screenshotDataUrl?.startsWith('data:image/jpeg;base64,')).toBe(true);
    });
  });

  describe('backwards-compat type backfill', () => {
    it('defaults missing type to selection on read', async () => {
      // Simulate a record persisted before the discriminator was added.
      const legacy = {
        id: 'legacy-1',
        selectedText: 'old',
        contextBefore: '',
        contextAfter: '',
        sourceUrl: 'https://example.com',
        pageTitle: 'Old',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as unknown as Selection;
      await repo.put(legacy);
      const got = await repo.getById(legacy.id);
      expectSelection(got);
      expect(got.type).toBe('selection');
    });
  });
});
