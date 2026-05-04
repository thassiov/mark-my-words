import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeBrowser, store } = vi.hoisted(() => {
  const inner = new Map<string, unknown>();
  return {
    store: inner,
    fakeBrowser: {
      storage: {
        local: {
          get: vi.fn(async (keys?: string | string[] | null) => {
            if (keys === undefined || keys === null) {
              return Object.fromEntries(inner);
            }
            const ks = typeof keys === 'string' ? [keys] : keys;
            const result: Record<string, unknown> = {};
            for (const k of ks) {
              const v = inner.get(k);
              if (v !== undefined) result[k] = v;
            }
            return result;
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) {
              inner.set(k, v);
            }
          }),
          remove: vi.fn(async (keys: string | string[]) => {
            const ks = typeof keys === 'string' ? [keys] : keys;
            for (const k of ks) inner.delete(k);
          }),
        },
      },
    },
  };
});

vi.mock('webextension-polyfill', () => ({ default: fakeBrowser }));

const { BrowserLocalRepo } = await import('./browser-local-repo.js');

interface Item {
  id: string;
  text: string;
}

describe('BrowserLocalRepo', () => {
  beforeEach(() => {
    store.clear();
  });

  describe('put + getById', () => {
    it('round-trips an item', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      await repo.put({ id: 'a', text: 'hello' });
      expect(await repo.getById('a')).toEqual({ id: 'a', text: 'hello' });
    });

    it('overwrites on second put with same id', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      await repo.put({ id: 'a', text: 'first' });
      await repo.put({ id: 'a', text: 'second' });
      expect(await repo.getById('a')).toEqual({ id: 'a', text: 'second' });
    });

    it('returns null for an unknown id', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      expect(await repo.getById('missing')).toBeNull();
    });
  });

  describe('getAll', () => {
    it('returns all items, only from this prefix', async () => {
      const a = new BrowserLocalRepo<Item>('a');
      const b = new BrowserLocalRepo<Item>('b');
      await a.put({ id: '1', text: 'a-one' });
      await a.put({ id: '2', text: 'a-two' });
      await b.put({ id: '1', text: 'b-one' });

      const aItems = await a.getAll();
      expect(aItems).toHaveLength(2);
      expect(aItems.map((i) => i.text).sort()).toEqual(['a-one', 'a-two']);

      const bItems = await b.getAll();
      expect(bItems).toHaveLength(1);
      expect(bItems[0]?.text).toBe('b-one');
    });

    it('returns empty array when prefix has no items', async () => {
      const repo = new BrowserLocalRepo<Item>('empty');
      expect(await repo.getAll()).toEqual([]);
    });

    it('does not match items with similar but different prefixes', async () => {
      // store.set is what set() does; verify isOurKey logic excludes 'items2.foo' from 'items'
      const items = new BrowserLocalRepo<Item>('items');
      const items2 = new BrowserLocalRepo<Item>('items2');
      await items.put({ id: 'foo', text: 'one' });
      await items2.put({ id: 'foo', text: 'two' });
      const result = await items.getAll();
      expect(result).toHaveLength(1);
      expect(result[0]?.text).toBe('one');
    });
  });

  describe('delete', () => {
    it('removes an item', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      await repo.put({ id: 'a', text: 'x' });
      await repo.delete('a');
      expect(await repo.getById('a')).toBeNull();
    });

    it('is a no-op for an unknown id', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      await expect(repo.delete('missing')).resolves.toBeUndefined();
    });

    it('only removes the matching id, not siblings', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      await repo.put({ id: 'a', text: '1' });
      await repo.put({ id: 'b', text: '2' });
      await repo.delete('a');
      expect(await repo.getById('a')).toBeNull();
      expect(await repo.getById('b')).toEqual({ id: 'b', text: '2' });
    });
  });

  describe('count', () => {
    it('starts at 0', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      expect(await repo.count()).toBe(0);
    });

    it('reflects puts and deletes', async () => {
      const repo = new BrowserLocalRepo<Item>('items');
      await repo.put({ id: 'a', text: 'x' });
      await repo.put({ id: 'b', text: 'y' });
      expect(await repo.count()).toBe(2);
      await repo.delete('a');
      expect(await repo.count()).toBe(1);
    });

    it('only counts this prefix', async () => {
      const a = new BrowserLocalRepo<Item>('a');
      const b = new BrowserLocalRepo<Item>('b');
      await a.put({ id: '1', text: 'x' });
      await b.put({ id: '1', text: 'y' });
      await b.put({ id: '2', text: 'z' });
      expect(await a.count()).toBe(1);
      expect(await b.count()).toBe(2);
    });
  });
});
