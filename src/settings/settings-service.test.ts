import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../shared/types.js';
import { resetDatabaseForTesting } from '../storage/database.js';

import { SettingsService } from './settings-service.js';

describe('SettingsService', () => {
  let service: SettingsService;
  let dbName: string;

  beforeEach(() => {
    resetDatabaseForTesting();
    dbName = `mmw-test-settings-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    service = new SettingsService(dbName);
  });

  afterEach(() => {
    indexedDB.deleteDatabase(dbName);
    resetDatabaseForTesting();
  });

  describe('get', () => {
    it('returns DEFAULT_SETTINGS on a fresh store', async () => {
      expect(await service.get()).toEqual(DEFAULT_SETTINGS);
    });

    it('merges stored values over defaults', async () => {
      await service.update({ theme: 'dark', toastDurationMs: 0 });
      const got = await service.get();
      expect(got.theme).toBe('dark');
      expect(got.toastDurationMs).toBe(0);
      // Untouched keys still come from defaults.
      expect(got.captureScreenshot).toBe(DEFAULT_SETTINGS.captureScreenshot);
      expect(got.maxSelectionChars).toBe(DEFAULT_SETTINGS.maxSelectionChars);
    });

    it('coerces malformed stored values back to defaults', async () => {
      // Bypass the typed update() to write a wrong-type value.
      const db = (service as unknown as { table: { put: (r: unknown) => Promise<void> } }).table;
      await db.put({ key: 'theme', value: 42 });
      await db.put({ key: 'captureScreenshot', value: 'yes' });
      await db.put({ key: 'toastDurationMs', value: 'forever' });
      const got = await service.get();
      expect(got.theme).toBe(DEFAULT_SETTINGS.theme);
      expect(got.captureScreenshot).toBe(DEFAULT_SETTINGS.captureScreenshot);
      expect(got.toastDurationMs).toBe(DEFAULT_SETTINGS.toastDurationMs);
    });

    it('ignores unknown keys (forward-compat)', async () => {
      const db = (service as unknown as { table: { put: (r: unknown) => Promise<void> } }).table;
      await db.put({ key: 'futureFeatureFlag', value: 'on' });
      const got = await service.get();
      expect(got).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('update', () => {
    it('persists a single key', async () => {
      await service.update({ theme: 'light' });
      const got = await service.get();
      expect(got.theme).toBe('light');
    });

    it('persists multiple keys atomically', async () => {
      await service.update({
        theme: 'dark',
        captureScreenshot: false,
        toastDurationMs: 10_000,
      });
      const got = await service.get();
      expect(got.theme).toBe('dark');
      expect(got.captureScreenshot).toBe(false);
      expect(got.toastDurationMs).toBe(10_000);
    });

    it('returns the merged settings after the write', async () => {
      const result = await service.update({ stripTrackingParams: false });
      expect(result.stripTrackingParams).toBe(false);
      expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    });

    it('overwrites a previously-stored key', async () => {
      await service.update({ theme: 'light' });
      await service.update({ theme: 'dark' });
      const got = await service.get();
      expect(got.theme).toBe('dark');
    });

    it('empty patch is a no-op', async () => {
      const before = await service.get();
      const after = await service.update({});
      expect(after).toEqual(before);
    });
  });
});
