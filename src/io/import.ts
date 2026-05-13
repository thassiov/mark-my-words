import type { Table } from 'dexie';

import { newId } from '../lib/ulid.js';
import { SettingsService } from '../settings/settings-service.js';
import type { Record as MmwRecord } from '../shared/types.js';
import { getDatabase, type MetaRow } from '../storage/database.js';
import { IdbRepo } from '../storage/idb-repo.js';
import type { Repository } from '../storage/repository.js';

import type { MmwExport } from './format.js';

/**
 * How to resolve an incoming record whose `id` already exists locally:
 *  - `skip`: keep the local record, drop the incoming one. Default.
 *  - `replace`: overwrite the local record. Use for backup restore.
 *  - `rename`: assign the incoming record a fresh ULID and insert it.
 *    Use when merging two libraries that originated separately.
 */
export type ConflictPolicy = 'skip' | 'replace' | 'rename';

export interface ImportOptions {
  conflict: ConflictPolicy;
  /**
   * Whether to also import the envelope's `settings` and `meta` blocks.
   * Defaults to `true`. Set false to import only records (e.g. when
   * merging a foreign library and the user wants to keep their own
   * settings).
   */
  applyEnvelope?: boolean;
}

/**
 * Counts surfaced in the post-import toast. `imported` is records with
 * no local id collision; `replaced` / `renamed` are subsets of the
 * conflicting records, depending on policy.
 */
export interface ImportSummary {
  imported: number;
  skipped: number;
  replaced: number;
  renamed: number;
}

/**
 * Why a parsed envelope couldn't actually be applied. Distinct from
 * `ImportError` in format.ts — those are envelope-shape failures
 * (caught by `parseExport`); these are *content* failures discovered
 * during the import itself.
 */
export interface ImportFailure {
  kind: 'invalid-record';
  index: number;
  reason: string;
}

export class ImportValidationError extends Error {
  readonly failure: ImportFailure;
  constructor(failure: ImportFailure) {
    super(`records[${String(failure.index)}]: ${failure.reason}`);
    this.name = 'ImportValidationError';
    this.failure = failure;
  }
}

export interface ImportDeps {
  repo?: Repository<MmwRecord>;
  settings?: SettingsService;
  meta?: Table<MetaRow, string>;
  generateId?: () => string;
}

/**
 * Apply an already-parsed export envelope to the local library.
 *
 * Validation runs over the entire `records` array up-front; if any
 * record fails the runtime check we throw `ImportValidationError`
 * before any write happens. This is the "all-or-nothing" guarantee
 * for malformed files (hand-edited / corrupted).
 *
 * Past the validation gate, writes happen record-by-record. We do not
 * wrap the per-record writes in a Dexie transaction: at realistic
 * library sizes a partial write isn't catastrophic (each write is
 * independent), and a transaction would couple this function to the
 * Dexie API surface for little gain.
 */
export async function importExport(
  env: MmwExport,
  options: ImportOptions,
  deps: ImportDeps = {},
): Promise<ImportSummary> {
  const repo = deps.repo ?? new IdbRepo();
  const settings = deps.settings ?? new SettingsService();
  const meta = deps.meta ?? getDatabase().meta;
  const generateId = deps.generateId ?? newId;
  const applyEnvelope = options.applyEnvelope ?? true;

  for (const [i, rec] of env.records.entries()) {
    const reason = validateRecord(rec);
    if (reason !== null) {
      throw new ImportValidationError({ kind: 'invalid-record', index: i, reason });
    }
  }

  const summary: ImportSummary = { imported: 0, skipped: 0, replaced: 0, renamed: 0 };
  for (const rec of env.records) {
    await applyRecord(repo, rec, options.conflict, generateId, summary);
  }

  if (applyEnvelope) {
    await applyEnvelopeMeta(env, settings, meta);
  }

  return summary;
}

async function applyRecord(
  repo: Repository<MmwRecord>,
  rec: MmwRecord,
  policy: ConflictPolicy,
  generateId: () => string,
  summary: ImportSummary,
): Promise<void> {
  const existing = await repo.getById(rec.id);
  if (existing === null) {
    await repo.put(rec);
    summary.imported++;
    return;
  }
  if (policy === 'skip') {
    summary.skipped++;
    return;
  }
  if (policy === 'replace') {
    await repo.put(rec);
    summary.replaced++;
    return;
  }
  await repo.put({ ...rec, id: generateId() });
  summary.renamed++;
}

async function applyEnvelopeMeta(
  env: MmwExport,
  settings: SettingsService,
  meta: Table<MetaRow, string>,
): Promise<void> {
  if (Object.keys(env.settings).length > 0) {
    await settings.update(env.settings);
  }
  const metaEntries = Object.entries(env.meta);
  if (metaEntries.length > 0) {
    await meta.bulkPut(metaEntries.map(([key, value]) => ({ key, value })));
  }
}

/**
 * Runtime shape check for a single record. Returns `null` if the
 * record is acceptable, otherwise a short reason string for the
 * caller to surface. Trailing / unknown fields are ignored — we want
 * forward-compat with future field additions.
 */
function validateRecord(rec: unknown): string | null {
  if (typeof rec !== 'object' || rec === null) return 'not an object';
  const r = rec as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || r['id'].length === 0) return 'id must be a non-empty string';
  if (r['type'] !== 'selection' && r['type'] !== 'page') {
    return `unknown type ${String(r['type'])}`;
  }
  for (const field of ['sourceUrl', 'pageTitle', 'createdAt', 'updatedAt'] as const) {
    if (typeof r[field] !== 'string') return `${field} must be a string`;
  }
  if (r['type'] === 'selection') {
    for (const field of ['selectedText', 'contextBefore', 'contextAfter'] as const) {
      if (typeof r[field] !== 'string') return `${field} must be a string`;
    }
  }
  return validateOptionalFields(r);
}

function validateOptionalFields(r: Record<string, unknown>): string | null {
  if (r['archivedAt'] !== undefined && typeof r['archivedAt'] !== 'string') {
    return 'archivedAt must be a string when present';
  }
  if (r['screenshotDataUrl'] !== undefined && typeof r['screenshotDataUrl'] !== 'string') {
    return 'screenshotDataUrl must be a string when present';
  }
  if (r['tags'] === undefined) return null;
  if (!Array.isArray(r['tags']) || r['tags'].some((t) => typeof t !== 'string')) {
    return 'tags must be an array of strings when present';
  }
  return null;
}
