import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Snippet, SnippetInput } from '../shared/types.js';
import type { Repository } from '../storage/repository.js';

import { SnippetService, normalizeTags } from './snippet-service.js';

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
      await expect(service.update('no-such-id', { note: 'x' })).rejects.toThrow(
        'Snippet no-such-id not found',
      );
    });
  });

  describe('archive / unarchive', () => {
    it('archive sets archivedAt and bumps updatedAt', async () => {
      vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
      const snippet = await service.save(baseInput);

      vi.setSystemTime(new Date('2026-05-04T11:00:00Z'));
      const archived = await service.archive(snippet.id);

      expect(archived.archivedAt).toBe('2026-05-04T11:00:00.000Z');
      expect(archived.updatedAt).toBe('2026-05-04T11:00:00.000Z');
      expect(archived.createdAt).toBe(snippet.createdAt);
    });

    it('unarchive clears archivedAt and bumps updatedAt', async () => {
      vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
      const snippet = await service.save(baseInput);

      vi.setSystemTime(new Date('2026-05-04T11:00:00Z'));
      await service.archive(snippet.id);

      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      const restored = await service.unarchive(snippet.id);

      expect(restored.archivedAt).toBeUndefined();
      expect(restored.updatedAt).toBe('2026-05-04T12:00:00.000Z');
    });

    it('archive on an already-archived snippet is a no-op', async () => {
      vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
      const snippet = await service.save(baseInput);

      vi.setSystemTime(new Date('2026-05-04T11:00:00Z'));
      const first = await service.archive(snippet.id);

      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      const second = await service.archive(snippet.id);

      expect(second).toEqual(first);
      expect(second.archivedAt).toBe('2026-05-04T11:00:00.000Z');
    });

    it('unarchive on a non-archived snippet is a no-op', async () => {
      const snippet = await service.save(baseInput);
      const result = await service.unarchive(snippet.id);
      expect(result).toEqual(snippet);
    });

    it('throws when archiving an unknown id', async () => {
      await expect(service.archive('no-such-id')).rejects.toThrow('Snippet no-such-id not found');
    });

    it('throws when unarchiving an unknown id', async () => {
      await expect(service.unarchive('no-such-id')).rejects.toThrow('Snippet no-such-id not found');
    });
  });

  describe('list with archived filter', () => {
    it('default lists only active snippets', async () => {
      vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
      const a = await service.save({ ...baseInput, selectedText: 'a' });
      const b = await service.save({ ...baseInput, selectedText: 'b' });
      await service.archive(a.id);

      const result = await service.list();
      expect(result.map((s) => s.id)).toEqual([b.id]);
    });

    it('archived: false matches default', async () => {
      const a = await service.save({ ...baseInput, selectedText: 'a' });
      await service.save({ ...baseInput, selectedText: 'b' });
      await service.archive(a.id);

      expect((await service.list({ archived: false })).map((s) => s.selectedText)).toEqual(['b']);
    });

    it('archived: true returns only archived snippets sorted by archivedAt desc', async () => {
      vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
      const a = await service.save({ ...baseInput, selectedText: 'a' });
      const b = await service.save({ ...baseInput, selectedText: 'b' });

      vi.setSystemTime(new Date('2026-05-04T11:00:00Z'));
      await service.archive(b.id);
      vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
      await service.archive(a.id);

      const result = await service.list({ archived: true });
      // a was archived later → comes first
      expect(result.map((s) => s.selectedText)).toEqual(['a', 'b']);
    });

    it('archived: true ignores active snippets', async () => {
      await service.save({ ...baseInput, selectedText: 'active' });
      const archived = await service.save({ ...baseInput, selectedText: 'archived' });
      await service.archive(archived.id);

      const result = await service.list({ archived: true });
      expect(result.map((s) => s.selectedText)).toEqual(['archived']);
    });

    it('archive does not affect total count', async () => {
      const a = await service.save(baseInput);
      await service.save(baseInput);
      await service.archive(a.id);
      expect(await service.count()).toBe(2);
    });
  });

  describe('tags', () => {
    it('save normalizes tags: lowercases, trims, dedupes, drops empty', async () => {
      const snippet = await service.save({
        ...baseInput,
        tags: ['  Foo ', 'BAR', 'foo', '', '   ', 'Bar'],
      });
      expect(snippet.tags).toEqual(['foo', 'bar']);
    });

    it('save with all-empty tags omits the field', async () => {
      const snippet = await service.save({ ...baseInput, tags: ['  ', ''] });
      expect(snippet.tags).toBeUndefined();
    });

    it('save without tags leaves the field absent', async () => {
      const snippet = await service.save(baseInput);
      expect(snippet.tags).toBeUndefined();
    });

    it('update can set tags on a snippet that had none', async () => {
      const snippet = await service.save(baseInput);
      const updated = await service.update(snippet.id, { tags: ['react', 'dom'] });
      expect(updated.tags).toEqual(['react', 'dom']);
    });

    it('update can replace existing tags', async () => {
      const snippet = await service.save({ ...baseInput, tags: ['old'] });
      const updated = await service.update(snippet.id, { tags: ['new', 'shiny'] });
      expect(updated.tags).toEqual(['new', 'shiny']);
    });

    it('update with empty tags array clears the field', async () => {
      const snippet = await service.save({ ...baseInput, tags: ['will', 'be', 'gone'] });
      const updated = await service.update(snippet.id, { tags: [] });
      expect(updated.tags).toBeUndefined();
    });

    it('update with explicit undefined clears the field', async () => {
      const snippet = await service.save({ ...baseInput, tags: ['gone'] });
      const updated = await service.update(snippet.id, { tags: undefined });
      expect(updated.tags).toBeUndefined();
    });

    it('update without tags key leaves existing tags untouched', async () => {
      const snippet = await service.save({ ...baseInput, tags: ['kept'] });
      const updated = await service.update(snippet.id, { note: 'just the note' });
      expect(updated.tags).toEqual(['kept']);
      expect(updated.note).toBe('just the note');
    });

    it('update normalizes tag input', async () => {
      const snippet = await service.save(baseInput);
      const updated = await service.update(snippet.id, { tags: [' React ', 'react', 'DOM'] });
      expect(updated.tags).toEqual(['react', 'dom']);
    });
  });
});

describe('normalizeTags', () => {
  it('lowercases and trims', () => {
    expect(normalizeTags(['  Foo  ', 'BAR'])).toEqual(['foo', 'bar']);
  });

  it('dedupes preserving first-seen order', () => {
    expect(normalizeTags(['a', 'b', 'A', 'B', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('drops empty entries', () => {
    expect(normalizeTags(['', '   ', '\t', 'real'])).toEqual(['real']);
  });

  it('returns a fresh array', () => {
    const input = ['a', 'b'];
    const out = normalizeTags(input);
    expect(out).not.toBe(input);
  });
});
