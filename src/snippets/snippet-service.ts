import { newId } from '../lib/ulid.js';
import { nowIso } from '../lib/time.js';
import type { Repository } from '../storage/repository.js';
import type { Snippet, SnippetEdit, SnippetInput } from '../shared/types.js';

export interface ListOptions {
  /** Max number of items to return. */
  limit?: number;
  /** Number of items to skip from the start of the sorted list. */
  offset?: number;
}

/**
 * Domain service for snippets. Owns:
 * - id assignment (via {@link newId})
 * - timestamping (via {@link nowIso})
 * - sorting / pagination on read
 *
 * Persistence is delegated to the injected {@link Repository} —
 * `SnippetService` has no IO knowledge.
 */
export class SnippetService {
  constructor(private readonly repo: Repository<Snippet>) {}

  /** Persist a new snippet. Assigns a ULID and matching createdAt/updatedAt. */
  async save(input: SnippetInput): Promise<Snippet> {
    const now = nowIso();
    const snippet: Snippet = {
      ...input,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.put(snippet);
    return snippet;
  }

  /**
   * Return all snippets sorted newest-first. ULIDs sort by creation time
   * lexicographically, so the sort doubles as a tie-breaker for items
   * created in the same millisecond.
   */
  async list(opts: ListOptions = {}): Promise<Snippet[]> {
    const all = await this.repo.getAll();
    all.sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    });
    const offset = opts.offset ?? 0;
    const end = opts.limit === undefined ? undefined : offset + opts.limit;
    return all.slice(offset, end);
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async update(id: string, edit: SnippetEdit): Promise<Snippet> {
    const existing = await this.repo.getById(id);
    if (existing === null) throw new Error(`Snippet ${id} not found`);
    const updated: Snippet = { ...existing, updatedAt: nowIso() };
    // `note` in edit distinguishes explicit `note: undefined` (clear) from key absent (no-op).
    if ('note' in edit) {
      if (edit.note === undefined) {
        delete updated.note;
      } else {
        updated.note = edit.note;
      }
    }
    await this.repo.put(updated);
    return updated;
  }
}
