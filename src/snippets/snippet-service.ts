import { newId } from '../lib/ulid.js';
import { nowIso } from '../lib/time.js';
import type { Repository } from '../storage/repository.js';
import type { Snippet, SnippetEdit, SnippetInput } from '../shared/types.js';

/**
 * Normalize tag input: trim each entry, lowercase, drop empties, dedupe
 * preserving first-seen order. Returns a fresh array — never mutates input.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const norm = t.trim().toLowerCase();
    if (norm.length === 0) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

export interface ListOptions {
  /** Max number of items to return. */
  limit?: number;
  /** Number of items to skip from the start of the sorted list. */
  offset?: number;
  /**
   * Filter by archive state.
   *   - `false` (default): only active snippets (`archivedAt === undefined`).
   *   - `true`: only archived snippets, sorted newest-archived first.
   *   - `undefined` *via explicit pass*: behaves like `false`. Callers
   *     that want the unfiltered set should compose two `list` calls.
   */
  archived?: boolean;
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
    if (input.tags !== undefined) {
      const normalized = normalizeTags(input.tags);
      if (normalized.length > 0) {
        snippet.tags = normalized;
      } else {
        delete snippet.tags;
      }
    }
    await this.repo.put(snippet);
    return snippet;
  }

  /**
   * Return snippets in the requested archive state, sorted newest-first.
   *
   * Active list (default): sort by `createdAt` desc; ULIDs break ties.
   * Archived list (`archived: true`): sort by `archivedAt` desc; if two
   * snippets were archived in the same millisecond, fall back to id.
   */
  async list(opts: ListOptions = {}): Promise<Snippet[]> {
    const archived = opts.archived ?? false;
    const all = await this.repo.getAll();
    const filtered = all.filter((s) =>
      archived ? s.archivedAt !== undefined : s.archivedAt === undefined,
    );
    if (archived) {
      filtered.sort((a, b) => {
        // Both have archivedAt by the filter above.
        const aa = a.archivedAt as string;
        const bb = b.archivedAt as string;
        if (aa !== bb) return aa < bb ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
    } else {
      filtered.sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
    }
    const offset = opts.offset ?? 0;
    const end = opts.limit === undefined ? undefined : offset + opts.limit;
    return filtered.slice(offset, end);
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
    if ('tags' in edit) {
      if (edit.tags === undefined) {
        delete updated.tags;
      } else {
        const normalized = normalizeTags(edit.tags);
        if (normalized.length === 0) {
          delete updated.tags;
        } else {
          updated.tags = normalized;
        }
      }
    }
    await this.repo.put(updated);
    return updated;
  }

  /** Move a snippet to the archived list. No-op (returns existing) if already archived. */
  async archive(id: string): Promise<Snippet> {
    const existing = await this.repo.getById(id);
    if (existing === null) throw new Error(`Snippet ${id} not found`);
    if (existing.archivedAt !== undefined) return existing;
    const now = nowIso();
    const updated: Snippet = { ...existing, archivedAt: now, updatedAt: now };
    await this.repo.put(updated);
    return updated;
  }

  /** Restore an archived snippet to the active list. No-op (returns existing) if already active. */
  async unarchive(id: string): Promise<Snippet> {
    const existing = await this.repo.getById(id);
    if (existing === null) throw new Error(`Snippet ${id} not found`);
    if (existing.archivedAt === undefined) return existing;
    const updated: Snippet = { ...existing, updatedAt: nowIso() };
    delete updated.archivedAt;
    await this.repo.put(updated);
    return updated;
  }
}
