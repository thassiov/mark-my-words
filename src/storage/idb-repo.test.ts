import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Snippet } from '../shared/types.js';

import { IdbRepo } from './idb-repo.js';

const baseSnippet = (overrides: Partial<Snippet> = {}): Snippet => ({
  id: 'id-0001',
  selectedText: 'hello',
  contextBefore: '',
  contextAfter: '',
  sourceUrl: 'https://example.com',
  pageTitle: 'Example',
  createdAt: '2026-05-04T12:00:00.000Z',
  updatedAt: '2026-05-04T12:00:00.000Z',
  ...overrides,
});

describe('IdbRepo', () => {
  let repo: IdbRepo;
  let dbName: string;

  beforeEach(() => {
    // Fresh DB per test so state doesn't leak.
    dbName = `mmw-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    repo = new IdbRepo(dbName);
  });

  afterEach(async () => {
    // Cleanup: deleteDatabase via Dexie's API. We re-import the class,
    // open it again to call delete(), then close. Cheaper would be to
    // hold onto the Dexie instance — keep it simple here.
    await indexedDB.deleteDatabase(dbName);
  });

  describe('put + getById', () => {
    it('round-trips an item', async () => {
      const s = baseSnippet({ selectedText: 'hi' });
      await repo.put(s);
      expect(await repo.getById(s.id)).toEqual(s);
    });

    it('overwrites on second put with same id', async () => {
      const a = baseSnippet({ selectedText: 'first' });
      await repo.put(a);
      await repo.put({ ...a, selectedText: 'second' });
      const got = await repo.getById(a.id);
      expect(got?.selectedText).toBe('second');
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
      await repo.put(baseSnippet({ id: 'a', selectedText: 'one' }));
      await repo.put(baseSnippet({ id: 'b', selectedText: 'two' }));
      const all = await repo.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((i) => i.selectedText).sort()).toEqual(['one', 'two']);
    });
  });

  describe('delete', () => {
    it('removes an item', async () => {
      const s = baseSnippet();
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
      await repo.put(baseSnippet({ id: 'a' }));
      await repo.put(baseSnippet({ id: 'b' }));
      expect(await repo.count()).toBe(2);
      await repo.delete('a');
      expect(await repo.count()).toBe(1);
    });
  });

  describe('large fields (screenshots)', () => {
    it('stores and retrieves a large data URL', async () => {
      const big = 'data:image/jpeg;base64,' + 'A'.repeat(200_000); // ~200 KB
      const s = baseSnippet({ screenshotDataUrl: big });
      await repo.put(s);
      const got = await repo.getById(s.id);
      expect(got?.screenshotDataUrl).toHaveLength(big.length);
      expect(got?.screenshotDataUrl?.startsWith('data:image/jpeg;base64,')).toBe(true);
    });
  });
});
