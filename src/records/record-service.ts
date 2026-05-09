import { nowIso } from '../lib/time.js';
import { newId } from '../lib/ulid.js';
import type {
  Page,
  PageInput,
  Record,
  RecordEdit,
  Selection,
  SelectionInput,
} from '../shared/types.js';
import type { Repository } from '../storage/repository.js';

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
   *   - `false` (default): only active records (`archivedAt === undefined`).
   *   - `true`: only archived records, sorted newest-archived first.
   *   - `undefined` *via explicit pass*: behaves like `false`. Callers
   *     that want the unfiltered set should compose two `list` calls.
   */
  archived?: boolean;
}

/**
 * Domain service for library records (selections + pages). Owns:
 * - id assignment (via {@link newId})
 * - timestamping (via {@link nowIso})
 * - sorting / pagination on read
 *
 * Persistence is delegated to the injected {@link Repository} —
 * `RecordService` has no IO knowledge.
 */
export class RecordService {
  constructor(private readonly repo: Repository<Record>) {}

  /** Persist a new selection. Assigns a ULID, type='selection', and matching createdAt/updatedAt. */
  async saveSelection(input: SelectionInput): Promise<Selection> {
    const now = nowIso();
    const selection: Selection = {
      ...input,
      id: newId(),
      type: 'selection',
      createdAt: now,
      updatedAt: now,
    };
    applyTagNormalization(selection, input.tags);
    await this.repo.put(selection);
    return selection;
  }

  /** Persist a new page. Assigns a ULID, type='page', and matching createdAt/updatedAt. */
  async savePage(input: PageInput): Promise<Page> {
    const now = nowIso();
    const page: Page = {
      ...input,
      id: newId(),
      type: 'page',
      createdAt: now,
      updatedAt: now,
    };
    applyTagNormalization(page, input.tags);
    await this.repo.put(page);
    return page;
  }

  /**
   * Return records in the requested archive state, sorted newest-first.
   *
   * Active list (default): sort by `createdAt` desc; ULIDs break ties.
   * Archived list (`archived: true`): sort by `archivedAt` desc; if two
   * records were archived in the same millisecond, fall back to id.
   */
  async list(opts: ListOptions = {}): Promise<Record[]> {
    const archived = opts.archived ?? false;
    const all = await this.repo.getAll();
    const filtered = all.filter((s) =>
      archived ? s.archivedAt !== undefined : s.archivedAt === undefined,
    );
    if (archived) {
      filtered.sort((a, b) => {
        // Both have archivedAt by the filter above; treat undefined as
        // empty string just to satisfy the type narrower without
        // resorting to a non-null assertion.
        const aa = a.archivedAt ?? '';
        const bb = b.archivedAt ?? '';
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

  async update(id: string, edit: RecordEdit): Promise<Record> {
    const existing = await this.repo.getById(id);
    if (existing === null) throw new Error(`Record ${id} not found`);
    const updated: Record = { ...existing, updatedAt: nowIso() };
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

  /** Move a record to the archived list. No-op (returns existing) if already archived. */
  async archive(id: string): Promise<Record> {
    const existing = await this.repo.getById(id);
    if (existing === null) throw new Error(`Record ${id} not found`);
    if (existing.archivedAt !== undefined) return existing;
    const now = nowIso();
    const updated: Record = { ...existing, archivedAt: now, updatedAt: now };
    await this.repo.put(updated);
    return updated;
  }

  /** Restore an archived record to the active list. No-op (returns existing) if already active. */
  async unarchive(id: string): Promise<Record> {
    const existing = await this.repo.getById(id);
    if (existing === null) throw new Error(`Record ${id} not found`);
    if (existing.archivedAt === undefined) return existing;
    const updated: Record = { ...existing, updatedAt: nowIso() };
    delete updated.archivedAt;
    await this.repo.put(updated);
    return updated;
  }
}

/** Normalize tags in-place; drop the field if normalization leaves it empty. */
function applyTagNormalization(target: { tags?: string[] }, raw: string[] | undefined): void {
  if (raw === undefined) return;
  const normalized = normalizeTags(raw);
  if (normalized.length > 0) {
    target.tags = normalized;
  } else {
    delete target.tags;
  }
}
