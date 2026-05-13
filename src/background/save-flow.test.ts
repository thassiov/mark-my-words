import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { RecordService } from '../records/record-service.js';
import { SettingsService } from '../settings/settings-service.js';
import { DEFAULT_SETTINGS, type Selection } from '../shared/types.js';
import { getDatabase, resetDatabaseForTesting } from '../storage/database.js';
import { IdbRepo } from '../storage/idb-repo.js';

import type { ChromeApi } from './chrome-api.js';
import { createSaveFlow } from './save-flow.js';

const TAB_ID = 42;

const SELECTION_PAYLOAD = {
  selectedText: 'hello world',
  contextBefore: 'before ',
  contextAfter: ' after',
  sourceUrl: 'https://example.com/article?utm_source=foo',
  pageTitle: 'Example',
};

const PAGE_PAYLOAD = {
  sourceUrl: 'https://example.com/article?utm_source=foo',
  pageTitle: 'Example',
};

function makeDeps(): {
  chromeApi: MockProxy<ChromeApi>;
  records: RecordService;
  settings: SettingsService;
  dbName: string;
} {
  resetDatabaseForTesting();
  const dbName = `mmw-saveflow-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  getDatabase(dbName);
  const repo = new IdbRepo(dbName);
  const records = new RecordService(repo);
  const settings = new SettingsService(dbName);
  const chromeApi = mock<ChromeApi>();
  chromeApi.activeTabId.mockResolvedValue(TAB_ID);
  chromeApi.captureVisibleTabJpeg.mockResolvedValue('data:image/jpeg;base64,SHOT');
  chromeApi.showToast.mockResolvedValue(undefined);
  chromeApi.showSaveCard.mockResolvedValue(undefined);
  chromeApi.sendRuntimeMessage.mockResolvedValue(undefined);
  return { chromeApi, records, settings, dbName };
}

describe('saveFlow.saveSelection', () => {
  let deps: ReturnType<typeof makeDeps>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    deps = makeDeps();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    indexedDB.deleteDatabase(deps.dbName);
    resetDatabaseForTesting();
    warnSpy.mockRestore();
  });

  it('persists the selection, broadcasts created, and shows the save card', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    const stored = await deps.records.list({ archived: false });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe('selection');
    expect((stored[0] as Selection).selectedText).toBe('hello world');
    // utm_source stripped per DEFAULT_SETTINGS.stripTrackingParams = true.
    expect(stored[0]?.sourceUrl).toBe('https://example.com/article');
    expect(stored[0]?.screenshotDataUrl).toBe('data:image/jpeg;base64,SHOT');

    expect(deps.chromeApi.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'record:created' }),
    );
    expect(deps.chromeApi.showSaveCard).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({ recordId: stored[0]?.id, currentTags: [] }),
    );
  });

  it('omits screenshot when capture is disabled in settings', async () => {
    await deps.settings.update({ captureScreenshot: false });
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    expect(deps.chromeApi.captureVisibleTabJpeg).not.toHaveBeenCalled();
    const stored = await deps.records.list({ archived: false });
    expect(stored[0]?.screenshotDataUrl).toBeUndefined();
  });

  it('saves with no screenshot when capture rejects (restricted page)', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    deps.chromeApi.captureVisibleTabJpeg.mockRejectedValue(new Error('restricted'));
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    const stored = await deps.records.list({ archived: false });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.screenshotDataUrl).toBeUndefined();
  });

  it('preserves the source URL when stripTrackingParams is off', async () => {
    await deps.settings.update({ stripTrackingParams: false });
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    const stored = await deps.records.list({ archived: false });
    expect(stored[0]?.sourceUrl).toBe(SELECTION_PAYLOAD.sourceUrl);
  });

  it('shows an info toast and saves nothing when selection is empty', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(null);
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    expect(await deps.records.count()).toBe(0);
    expect(deps.chromeApi.showToast).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({ variant: 'info', message: 'Nothing selected' }),
    );
  });

  it('rejects oversized selections with an info toast', async () => {
    await deps.settings.update({ maxSelectionChars: 5 });
    deps.chromeApi.executeInTab.mockResolvedValue({
      ...SELECTION_PAYLOAD,
      selectedText: 'definitely longer than five',
    });
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    expect(await deps.records.count()).toBe(0);
    expect(deps.chromeApi.showToast).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({ message: expect.stringContaining('too large') }),
    );
  });

  it('bails silently when chrome.scripting.executeScript rejects', async () => {
    deps.chromeApi.executeInTab.mockRejectedValue(new Error('cannot inject into chrome:// pages'));
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    expect(await deps.records.count()).toBe(0);
    expect(deps.chromeApi.showToast).not.toHaveBeenCalled();
    expect(deps.chromeApi.showSaveCard).not.toHaveBeenCalled();
  });

  it('falls back to the active tab when no tabId is given', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelection();

    expect(deps.chromeApi.activeTabId).toHaveBeenCalled();
    expect(deps.chromeApi.showSaveCard).toHaveBeenCalled();
  });

  it('no-ops when there is no active tab', async () => {
    deps.chromeApi.activeTabId.mockResolvedValue(undefined);
    const flow = createSaveFlow(deps);

    await flow.saveSelection();

    expect(deps.chromeApi.executeInTab).not.toHaveBeenCalled();
    expect(await deps.records.count()).toBe(0);
  });

  it('uses the preread result without injecting again', async () => {
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID, SELECTION_PAYLOAD);

    expect(deps.chromeApi.executeInTab).not.toHaveBeenCalled();
    expect(await deps.records.count()).toBe(1);
  });

  it('emits an error toast and does not present the card when persist fails', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    vi.spyOn(deps.records, 'saveSelection').mockRejectedValue(new Error('disk is full'));
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    expect(deps.chromeApi.showToast).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({
        variant: 'error',
        message: expect.stringContaining('disk is full'),
      }),
    );
    expect(deps.chromeApi.showSaveCard).not.toHaveBeenCalled();
  });
});

describe('saveFlow.savePage', () => {
  let deps: ReturnType<typeof makeDeps>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    deps = makeDeps();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    indexedDB.deleteDatabase(deps.dbName);
    resetDatabaseForTesting();
    warnSpy.mockRestore();
  });

  it('persists the page record and shows the save card', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(PAGE_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.savePage(TAB_ID);

    const stored = await deps.records.list({ archived: false });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe('page');
    expect(stored[0]?.sourceUrl).toBe('https://example.com/article');
    expect(deps.chromeApi.showSaveCard).toHaveBeenCalled();
  });

  it('bails when page reader returns null', async () => {
    deps.chromeApi.executeInTab.mockResolvedValue(null);
    const flow = createSaveFlow(deps);

    await flow.savePage(TAB_ID);

    expect(await deps.records.count()).toBe(0);
    expect(deps.chromeApi.showSaveCard).not.toHaveBeenCalled();
  });
});

describe('saveFlow.saveSelectionOrPage', () => {
  let deps: ReturnType<typeof makeDeps>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    deps = makeDeps();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    indexedDB.deleteDatabase(deps.dbName);
    resetDatabaseForTesting();
    warnSpy.mockRestore();
  });

  it('routes to saveSelection when a selection is present', async () => {
    deps.chromeApi.executeInTab.mockResolvedValueOnce(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelectionOrPage(TAB_ID);

    const stored = await deps.records.list({ archived: false });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe('selection');
  });

  it('routes to savePage when no selection is present', async () => {
    // First call (probe) returns null; second call (savePage's reader) returns the page meta.
    deps.chromeApi.executeInTab.mockResolvedValueOnce(null).mockResolvedValueOnce(PAGE_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelectionOrPage(TAB_ID);

    const stored = await deps.records.list({ archived: false });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe('page');
  });

  it('bails silently when the probe injection rejects', async () => {
    deps.chromeApi.executeInTab.mockRejectedValueOnce(new Error('restricted'));
    const flow = createSaveFlow(deps);

    await flow.saveSelectionOrPage(TAB_ID);

    expect(await deps.records.count()).toBe(0);
  });
});

describe('saveFlow card.allTags', () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });
  afterEach(() => {
    indexedDB.deleteDatabase(deps.dbName);
    resetDatabaseForTesting();
  });

  it('passes a deduped, sorted union of existing tags to the save card', async () => {
    // Seed two records with overlapping tag sets so the union is meaningful.
    await deps.records.saveSelection({
      ...SELECTION_PAYLOAD,
      // saveSelection doesn't accept tags directly — update after.
    });
    const all = await deps.records.list({ archived: false });
    const firstId = all[0]?.id;
    if (firstId === undefined) throw new Error('seed failed');
    await deps.records.update(firstId, { tags: ['zeta', 'alpha'] });
    await deps.records.saveSelection({
      ...SELECTION_PAYLOAD,
      selectedText: 'second',
    });
    const second = (await deps.records.list({ archived: false })).find((r) => r.id !== firstId);
    if (second === undefined) throw new Error('seed failed');
    await deps.records.update(second.id, { tags: ['alpha', 'beta'] });

    // Now exercise the flow.
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);
    await flow.saveSelection(TAB_ID);

    const lastCallArgs = deps.chromeApi.showSaveCard.mock.calls.at(-1);
    expect(lastCallArgs?.[1].allTags).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('passes the configured toast duration as visibleMs', async () => {
    await deps.settings.update({ toastDurationMs: 10_000 });
    deps.chromeApi.executeInTab.mockResolvedValue(SELECTION_PAYLOAD);
    const flow = createSaveFlow(deps);

    await flow.saveSelection(TAB_ID);

    expect(deps.chromeApi.showSaveCard).toHaveBeenCalledWith(
      TAB_ID,
      expect.objectContaining({ visibleMs: 10_000 }),
    );
    expect(DEFAULT_SETTINGS.toastDurationMs).not.toBe(10_000); // sanity: we did override
  });
});
