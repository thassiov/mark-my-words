import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Repository } from '../storage/repository.js';
import type { Snippet, SnippetInput } from '../shared/types.js';

import { SnippetService } from './snippet-service.js';

vi.mock('../lib/ulid.js', () => {
  let counter = 0;
  return {
    newId: vi.fn(() => {
      counter += 1;
      return `id-${String(counter).padStart(4, '0')}`;
    }),
  };
});

class InMemoryRepo implements Repository<Snippet> {
  private store = new Map<string, Snippet>();

  // eslint-disable-next-line @typescript-eslint/require-await
  async getAll(): Promise<Snippet[]> {
    return [...this.store.values()];
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getById(id: string): Promise<Snippet | null> {
    return this.store.get(id) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async put(item: Snippet): Promise<void> {
    this.store.set(item.id, item);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async count(): Promise<number> {
    return this.store.size;
  }
}

const baseInput: SnippetInput = {
  selectedText: 'hello world',
  contextBefore: 'before ',
  contextAfter: ' after',
  sourceUrl: 'https://example.com/page',
  pageTitle: 'Example',
};

describe('SnippetService', () => {
  let repo: InMemoryRepo;
  let service: SnippetService;

  beforeEach(() => {
    repo = new InMemoryRepo();
    service = new SnippetService(repo);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('save', () => {
    it('assigns id, createdAt, updatedAt', async () => {
      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      const snippet = await service.save(baseInput);
      expect(snippet.id).toBe('id-0001');
      expect(snippet.createdAt).toBe('2026-05-04T12:00:00.000Z');
      expect(snippet.updatedAt).toBe(snippet.createdAt);
    });

    it('persists via the repo', async () => {
      const snippet = await service.save(baseInput);
      expect(await repo.getById(snippet.id)).toEqual(snippet);
    });

    it('preserves all input fields', async () => {
      const input: SnippetInput = {
        ...baseInput,
        iframeUrl: 'https://example.com/iframe',
        note: 'a note',
      };
      const snippet = await service.save(input);
      expect(snippet.selectedText).toBe(input.selectedText);
      expect(snippet.contextBefore).toBe(input.contextBefore);
      expect(snippet.contextAfter).toBe(input.contextAfter);
      expect(snippet.sourceUrl).toBe(input.sourceUrl);
      expect(snippet.iframeUrl).toBe(input.iframeUrl);
      expect(snippet.pageTitle).toBe(input.pageTitle);
      expect(snippet.note).toBe(input.note);
    });
  });

  describe('list', () => {
    it('returns empty array when nothing saved', async () => {
      expect(await service.list()).toEqual([]);
    });

    it('returns items sorted newest-first', async () => {
      vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
      const a = await service.save({ ...baseInput, selectedText: 'a' });
      vi.setSystemTime(new Date('2026-05-04T11:00:00Z'));
      const b = await service.save({ ...baseInput, selectedText: 'b' });
      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      const c = await service.save({ ...baseInput, selectedText: 'c' });

      const result = await service.list();
      expect(result.map((s) => s.id)).toEqual([c.id, b.id, a.id]);
    });

    it('uses id as tiebreaker when createdAt matches', async () => {
      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      const a = await service.save({ ...baseInput, selectedText: 'a' });
      const b = await service.save({ ...baseInput, selectedText: 'b' });
      // Same timestamp; id-0002 > id-0001 → b is newer
      expect((await service.list()).map((s) => s.id)).toEqual([b.id, a.id]);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(`2026-05-04T1${String(i)}:00:00Z`));
        await service.save({ ...baseInput, selectedText: `item ${String(i)}` });
      }
      const result = await service.list({ limit: 2 });
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.selectedText)).toEqual(['item 4', 'item 3']);
    });

    it('respects offset', async () => {
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(`2026-05-04T1${String(i)}:00:00Z`));
        await service.save({ ...baseInput, selectedText: `item ${String(i)}` });
      }
      const result = await service.list({ offset: 2 });
      expect(result.map((s) => s.selectedText)).toEqual(['item 2', 'item 1', 'item 0']);
    });

    it('combines offset and limit', async () => {
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(new Date(`2026-05-04T1${String(i)}:00:00Z`));
        await service.save({ ...baseInput, selectedText: `item ${String(i)}` });
      }
      const result = await service.list({ offset: 1, limit: 2 });
      expect(result.map((s) => s.selectedText)).toEqual(['item 3', 'item 2']);
    });
  });

  describe('count', () => {
    it('starts at 0', async () => {
      expect(await service.count()).toBe(0);
    });

    it('reflects saves', async () => {
      await service.save(baseInput);
      await service.save(baseInput);
      expect(await service.count()).toBe(2);
    });

    it('agrees with list length', async () => {
      await service.save(baseInput);
      await service.save(baseInput);
      await service.save(baseInput);
      expect(await service.count()).toBe((await service.list()).length);
    });
  });

  describe('delete', () => {
    it('removes the snippet from the repo', async () => {
      const snippet = await service.save(baseInput);
      await service.delete(snippet.id);
      expect(await repo.getById(snippet.id)).toBeNull();
    });

    it('reduces count by 1', async () => {
      const a = await service.save(baseInput);
      await service.save(baseInput);
      await service.delete(a.id);
      expect(await service.count()).toBe(1);
    });

    it('is a no-op for an unknown id', async () => {
      await service.save(baseInput);
      await expect(service.delete('does-not-exist')).resolves.toBeUndefined();
      expect(await service.count()).toBe(1);
    });
  });

  describe('update', () => {
    it('merges edit fields and bumps updatedAt', async () => {
      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      const snippet = await service.save(baseInput);

      vi.setSystemTime(new Date('2026-05-04T13:00:00Z'));
      const updated = await service.update(snippet.id, { note: 'edited note' });

      expect(updated.note).toBe('edited note');
      expect(updated.updatedAt).toBe('2026-05-04T13:00:00.000Z');
      expect(updated.createdAt).toBe(snippet.createdAt);
    });

    it('persists the update to the repo', async () => {
      const snippet = await service.save(baseInput);
      await service.update(snippet.id, { note: 'new note' });
      const stored = await repo.getById(snippet.id);
      expect(stored?.note).toBe('new note');
    });

    it('does not touch immutable provenance fields', async () => {
      const snippet = await service.save(baseInput);
      const updated = await service.update(snippet.id, { note: 'a note' });
      expect(updated.selectedText).toBe(snippet.selectedText);
      expect(updated.sourceUrl).toBe(snippet.sourceUrl);
      expect(updated.contextBefore).toBe(snippet.contextBefore);
      expect(updated.contextAfter).toBe(snippet.contextAfter);
      expect(updated.pageTitle).toBe(snippet.pageTitle);
    });

    it('can set note on a snippet that had none', async () => {
      const snippet = await service.save(baseInput);
      const updated = await service.update(snippet.id, { note: 'my note' });
      expect(updated.note).toBe('my note');
    });

    it('can clear note by passing undefined', async () => {
      const snippet = await service.save({ ...baseInput, note: 'existing' });
      const updated = await service.update(snippet.id, { note: undefined });
      expect(updated.note).toBeUndefined();
    });

    it('throws when the id does not exist', async () => {
      await expect(service.update('no-such-id', { selectedText: 'x' })).rejects.toThrow(
        'Snippet no-such-id not found',
      );
    });
  });
});
