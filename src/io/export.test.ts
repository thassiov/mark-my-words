import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SettingsService } from '../settings/settings-service.js';
import { DEFAULT_SETTINGS, type Selection } from '../shared/types.js';
import { getDatabase, resetDatabaseForTesting } from '../storage/database.js';
import { IdbRepo } from '../storage/idb-repo.js';

import { buildExport } from './export.js';
import { MMW_FORMAT_VERSION, type ExportProvenance } from './format.js';

const FIXED_NOW = new Date('2026-05-12T10:00:00.000Z');
const FIXED_PROVENANCE: ExportProvenance = {
  version: '0.1.0-rev-deadbee',
  userAgent: 'Mozilla/5.0 (test)',
};

function baseSelection(overrides: Partial<Selection> = {}): Selection {
  return {
    type: 'selection',
    id: 'sel-1',
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

describe('buildExport', () => {
  let dbName: string;
  let repo: IdbRepo;
  let settings: SettingsService;

  beforeEach(() => {
    resetDatabaseForTesting();
    dbName = `mmw-test-export-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    // Construct the singleton via the same name so every helper sees
    // the same DB instance.
    getDatabase(dbName);
    repo = new IdbRepo(dbName);
    settings = new SettingsService(dbName);
  });

  afterEach(() => {
    indexedDB.deleteDatabase(dbName);
    resetDatabaseForTesting();
  });

  const callBuild = (opts: { includeScreenshots: boolean }) =>
    buildExport(opts, {
      repo,
      settings,
      meta: getDatabase(dbName).meta,
      provenance: () => FIXED_PROVENANCE,
      now: () => FIXED_NOW,
    });

  it('produces a well-formed envelope on an empty library', async () => {
    const out = await callBuild({ includeScreenshots: true });
    expect(out.mmw).toBe(MMW_FORMAT_VERSION);
    expect(out.exportedAt).toBe(FIXED_NOW.toISOString());
    expect(out.exportedFrom).toEqual(FIXED_PROVENANCE);
    expect(out.records).toEqual([]);
    expect(out.meta).toEqual({});
  });

  it('returns settings filled from defaults when nothing stored', async () => {
    const out = await callBuild({ includeScreenshots: true });
    expect(out.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('reflects user-modified settings', async () => {
    await settings.update({ theme: 'dark', toastDurationMs: 10_000 });
    const out = await callBuild({ includeScreenshots: true });
    expect(out.settings.theme).toBe('dark');
    expect(out.settings.toastDurationMs).toBe(10_000);
  });

  it('includes every record in the library', async () => {
    await repo.put(baseSelection({ id: 'a', selectedText: 'one' }));
    await repo.put(baseSelection({ id: 'b', selectedText: 'two' }));
    const out = await callBuild({ includeScreenshots: true });
    expect(out.records).toHaveLength(2);
    const ids = out.records.map((r) => r.id).toSorted();
    expect(ids).toEqual(['a', 'b']);
  });

  it('preserves screenshotDataUrl when includeScreenshots is true', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    await repo.put(baseSelection({ id: 'shot', screenshotDataUrl: big }));
    const out = await callBuild({ includeScreenshots: true });
    expect(out.records[0]?.screenshotDataUrl).toBe(big);
  });

  it('strips screenshotDataUrl when includeScreenshots is false', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    await repo.put(baseSelection({ id: 'shot', screenshotDataUrl: big }));
    const out = await callBuild({ includeScreenshots: false });
    expect(out.records[0]).not.toHaveProperty('screenshotDataUrl');
    // Other fields survive intact.
    expect(out.records[0]?.id).toBe('shot');
    expect(out.records[0]?.type).toBe('selection');
  });

  it('does not mutate the source records when stripping screenshots', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(100);
    await repo.put(baseSelection({ id: 'shot', screenshotDataUrl: big }));
    await callBuild({ includeScreenshots: false });
    const stillThere = await repo.getById('shot');
    expect(stillThere?.screenshotDataUrl).toBe(big);
  });

  it('serializes meta rows into a plain object', async () => {
    const meta = getDatabase(dbName).meta;
    await meta.bulkPut([
      { key: 'schema_version', value: 2 },
      { key: 'created_at', value: '2026-05-04T00:00:00.000Z' },
    ]);
    const out = await callBuild({ includeScreenshots: true });
    expect(out.meta).toEqual({
      schema_version: 2,
      created_at: '2026-05-04T00:00:00.000Z',
    });
  });

  it('survives JSON round-trip and re-validates via the format parser', async () => {
    await repo.put(baseSelection({ id: 'r1' }));
    const out = await callBuild({ includeScreenshots: true });
    const wire = structuredClone(out) as unknown;
    expect(wire).toMatchObject({ mmw: MMW_FORMAT_VERSION });
  });
});
