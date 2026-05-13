import type { Table } from 'dexie';

import { SettingsService } from '../settings/settings-service.js';
import type { Record as MmwRecord } from '../shared/types.js';
import { getDatabase, type MetaRow } from '../storage/database.js';
import { IdbRepo } from '../storage/idb-repo.js';
import type { Repository } from '../storage/repository.js';

import { MMW_FORMAT_VERSION, type ExportProvenance, type MmwExport } from './format.js';

export interface BuildExportOptions {
  /**
   * Embed `screenshotDataUrl` on each record. When false, screenshots
   * are dropped from the output — useful for slim exports where the
   * user just wants their text content (page screenshots are 99% of
   * an export's byte size).
   */
  includeScreenshots: boolean;
}

/**
 * Dependency overrides for tests. Production callers pass nothing and
 * get the live Dexie-backed repo, settings service, and current-time
 * clock; provenance is read from `chrome.runtime.getManifest()` and
 * `navigator.userAgent`.
 */
export interface BuildExportDeps {
  repo?: Repository<MmwRecord>;
  settings?: SettingsService;
  meta?: Table<MetaRow, string>;
  provenance?: () => ExportProvenance;
  now?: () => Date;
}

/**
 * Read the whole library and return the in-memory `MmwExport` envelope.
 * Read-only — never writes back. Callers serialise the result with
 * `JSON.stringify` and pipe it to a Blob/download.
 *
 * Provenance defaults read from extension APIs (`chrome.runtime` /
 * `navigator`) — present in every browser context where this function
 * is legitimately called (app page, popup, background SW with a
 * compatibility shim). Tests override `provenance` to keep the function
 * pure.
 */
export async function buildExport(
  options: BuildExportOptions,
  deps: BuildExportDeps = {},
): Promise<MmwExport> {
  const repo = deps.repo ?? new IdbRepo();
  const settings = deps.settings ?? new SettingsService();
  const meta = deps.meta ?? getDatabase().meta;
  const provenance = deps.provenance ?? readProvenanceFromRuntime;
  const now = deps.now ?? (() => new Date());

  const [records, allSettings, metaRows] = await Promise.all([
    repo.getAll(),
    settings.get(),
    meta.toArray(),
  ]);

  return {
    mmw: MMW_FORMAT_VERSION,
    exportedAt: now().toISOString(),
    exportedFrom: provenance(),
    meta: Object.fromEntries(metaRows.map((row) => [row.key, row.value])),
    settings: allSettings,
    records: options.includeScreenshots ? records : records.map((r) => stripScreenshot(r)),
  };
}

function stripScreenshot(record: MmwRecord): MmwRecord {
  if (record.screenshotDataUrl === undefined) return record;
  const copy = { ...record };
  delete copy.screenshotDataUrl;
  return copy;
}

function readProvenanceFromRuntime(): ExportProvenance {
  const manifest = chrome.runtime.getManifest();
  return {
    version: manifest.version_name ?? manifest.version,
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  };
}
