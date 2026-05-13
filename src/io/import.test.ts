import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SettingsService } from '../settings/settings-service.js';
import { DEFAULT_SETTINGS, type Selection } from '../shared/types.js';
import { getDatabase, resetDatabaseForTesting } from '../storage/database.js';
import { IdbRepo } from '../storage/idb-repo.js';

import { MMW_FORMAT_VERSION, type MmwExport } from './format.js';
import { ImportValidationError, importExport } from './import.js';

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

function envelope(overrides: Partial<MmwExport> = {}): MmwExport {
  return {
    mmw: MMW_FORMAT_VERSION,
    exportedAt: '2026-05-12T10:00:00.000Z',
    exportedFrom: { version: '0.1.0', userAgent: 'test-ua' },
    meta: {},
    settings: {},
    records: [],
    ...overrides,
  };
}

describe('importExport', () => {
  let dbName: string;
  let repo: IdbRepo;
  let settings: SettingsService;

  beforeEach(() => {
    resetDatabaseForTesting();
    dbName = `mmw-test-import-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    getDatabase(dbName);
    repo = new IdbRepo(dbName);
    settings = new SettingsService(dbName);
  });

  afterEach(() => {
    indexedDB.deleteDatabase(dbName);
    resetDatabaseForTesting();
  });

  const callImport = (env: MmwExport, opts: { conflict: 'skip' | 'replace' | 'rename' }) =>
    importExport(env, opts, {
      repo,
      settings,
      meta: getDatabase(dbName).meta,
      generateId: () => 'GENERATED',
    });

  it('imports records into an empty library', async () => {
    const env = envelope({
      records: [baseSelection({ id: 'a' }), baseSelection({ id: 'b', selectedText: 'two' })],
    });
    const summary = await callImport(env, { conflict: 'skip' });
    expect(summary).toEqual({ imported: 2, skipped: 0, replaced: 0, renamed: 0 });
    expect(await repo.count()).toBe(2);
  });

  it('skips duplicates under skip policy', async () => {
    await repo.put(baseSelection({ id: 'a', selectedText: 'local' }));
    const env = envelope({
      records: [baseSelection({ id: 'a', selectedText: 'incoming' })],
    });
    const summary = await callImport(env, { conflict: 'skip' });
    expect(summary).toEqual({ imported: 0, skipped: 1, replaced: 0, renamed: 0 });
    const kept = await repo.getById('a');
    expect(kept?.type === 'selection' && kept.selectedText).toBe('local');
  });

  it('overwrites duplicates under replace policy', async () => {
    await repo.put(baseSelection({ id: 'a', selectedText: 'local' }));
    const env = envelope({
      records: [baseSelection({ id: 'a', selectedText: 'incoming' })],
    });
    const summary = await callImport(env, { conflict: 'replace' });
    expect(summary).toEqual({ imported: 0, skipped: 0, replaced: 1, renamed: 0 });
    const kept = await repo.getById('a');
    expect(kept?.type === 'selection' && kept.selectedText).toBe('incoming');
  });

  it('keeps both records with a fresh id under rename policy', async () => {
    await repo.put(baseSelection({ id: 'a', selectedText: 'local' }));
    const env = envelope({
      records: [baseSelection({ id: 'a', selectedText: 'incoming' })],
    });
    const summary = await callImport(env, { conflict: 'rename' });
    expect(summary).toEqual({ imported: 0, skipped: 0, replaced: 0, renamed: 1 });
    expect(await repo.count()).toBe(2);
    const original = await repo.getById('a');
    const renamed = await repo.getById('GENERATED');
    expect(original?.type === 'selection' && original.selectedText).toBe('local');
    expect(renamed?.type === 'selection' && renamed.selectedText).toBe('incoming');
  });

  it('preserves archived state on imported records', async () => {
    const archived = baseSelection({
      id: 'archived',
      archivedAt: '2026-05-10T00:00:00.000Z',
    });
    await callImport(envelope({ records: [archived] }), { conflict: 'skip' });
    const got = await repo.getById('archived');
    expect(got?.archivedAt).toBe('2026-05-10T00:00:00.000Z');
  });

  it('throws ImportValidationError on the first malformed record and writes nothing', async () => {
    const env = envelope({
      records: [
        baseSelection({ id: 'good' }),
        { id: 'bad', type: 'banana' } as unknown as Selection,
        baseSelection({ id: 'after' }),
      ],
    });
    await expect(callImport(env, { conflict: 'skip' })).rejects.toBeInstanceOf(
      ImportValidationError,
    );
    expect(await repo.count()).toBe(0);
    try {
      await callImport(env, { conflict: 'skip' });
    } catch (e) {
      if (e instanceof ImportValidationError) {
        expect(e.failure.index).toBe(1);
        expect(e.failure.reason).toMatch(/banana/);
      }
    }
  });

  it('applies envelope settings into the local store', async () => {
    const env = envelope({
      settings: { theme: 'dark', toastDurationMs: 10_000 },
    });
    await callImport(env, { conflict: 'skip' });
    const merged = await settings.get();
    expect(merged.theme).toBe('dark');
    expect(merged.toastDurationMs).toBe(10_000);
    // Untouched keys stay at defaults.
    expect(merged.captureScreenshot).toBe(DEFAULT_SETTINGS.captureScreenshot);
  });

  it('writes envelope meta rows', async () => {
    const env = envelope({
      meta: { schema_version: 2, created_at: '2026-05-01T00:00:00.000Z' },
    });
    await callImport(env, { conflict: 'skip' });
    const rows = await getDatabase(dbName).meta.toArray();
    expect(rows).toEqual(
      expect.arrayContaining([
        { key: 'schema_version', value: 2 },
        { key: 'created_at', value: '2026-05-01T00:00:00.000Z' },
      ]),
    );
  });

  it('skips settings + meta when applyEnvelope is false', async () => {
    const env = envelope({
      settings: { theme: 'dark' },
      meta: { schema_version: 2 },
    });
    await importExport(
      env,
      { conflict: 'skip', applyEnvelope: false },
      { repo, settings, meta: getDatabase(dbName).meta, generateId: () => 'X' },
    );
    const merged = await settings.get();
    expect(merged.theme).toBe(DEFAULT_SETTINGS.theme);
    const rows = await getDatabase(dbName).meta.toArray();
    expect(rows).toEqual([]);
  });
});
