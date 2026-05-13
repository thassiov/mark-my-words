import { readPageInPage } from '../content/read-page.js';
import { readSelectionInPage, type ReadSelectionResult } from '../content/read-selection.js';
import { stripTrackingParams } from '../lib/url.js';
import type { RecordService } from '../records/record-service.js';
import type { SettingsService } from '../settings/settings-service.js';
import type { Settings, Record as MmwRecord } from '../shared/types.js';

import { emitRecordEvent } from './broadcast.js';
import type { ChromeApi } from './chrome-api.js';

const INJECT_FAILED = Symbol('inject-failed');
type InjectFailed = typeof INJECT_FAILED;

export interface SaveFlowDeps {
  chromeApi: ChromeApi;
  records: RecordService;
  settings: SettingsService;
}

export interface SaveFlow {
  /** Probe the page for a selection; if found save it, else save the page. */
  saveSelectionOrPage(tabId?: number): Promise<void>;
  /**
   * Save the selection in the given tab. `prereadResult`, when provided,
   * skips the read-selection injection — used by the keyboard-shortcut
   * path which has already probed.
   */
  saveSelection(tabId?: number, prereadResult?: ReadSelectionResult | null): Promise<void>;
  /** Save the bare page (no body excerpt) in the given tab. */
  savePage(tabId?: number): Promise<void>;
}

/**
 * Orchestration layer for the SW's save flows. Owns the order of
 * operations (probe → settings → screenshot → persist → broadcast →
 * present), the error/toast surface, and the cross-cutting concerns
 * (tracking-param stripping, save-card injection). All side effects go
 * through the injected {@link ChromeApi}.
 */
export function createSaveFlow(deps: SaveFlowDeps): SaveFlow {
  return {
    saveSelectionOrPage: (tabId) => saveSelectionOrPage(deps, tabId),
    saveSelection: (tabId, preread) => saveSelection(deps, tabId, preread),
    savePage: (tabId) => savePage(deps, tabId),
  };
}

async function saveSelectionOrPage(deps: SaveFlowDeps, tabId?: number): Promise<void> {
  const resolved = await resolveTabId(deps.chromeApi, tabId);
  if (resolved === undefined) return;
  const probed = await tryExecute(deps.chromeApi, resolved, readSelectionInPage, 'read selection');
  if (probed === INJECT_FAILED) return;
  await (probed === null ? savePage(deps, resolved) : saveSelection(deps, resolved, probed));
}

async function saveSelection(
  deps: SaveFlowDeps,
  tabId: number | undefined,
  prereadResult: ReadSelectionResult | null | undefined,
): Promise<void> {
  const resolved = await resolveTabId(deps.chromeApi, tabId);
  if (resolved === undefined) return;

  const result: ReadSelectionResult | null | InjectFailed =
    prereadResult === undefined
      ? await tryExecute(deps.chromeApi, resolved, readSelectionInPage, 'read selection')
      : prereadResult;
  if (result === INJECT_FAILED) return;

  if (result === null) {
    await infoToast(deps, resolved, 'Nothing selected');
    return;
  }

  const cfg = await deps.settings.get();
  if (result.selectedText.length > cfg.maxSelectionChars) {
    await infoToast(deps, resolved, 'Selection too large — try selecting less text');
    return;
  }

  const screenshotDataUrl = cfg.captureScreenshot
    ? await captureScreenshot(deps.chromeApi)
    : undefined;
  const sourceUrl = cfg.stripTrackingParams
    ? stripTrackingParams(result.sourceUrl)
    : result.sourceUrl;

  await persistAndPresent(deps, resolved, cfg, () =>
    deps.records.saveSelection({
      ...result,
      sourceUrl,
      ...(screenshotDataUrl !== undefined && { screenshotDataUrl }),
    }),
  );
}

async function savePage(deps: SaveFlowDeps, tabId?: number): Promise<void> {
  const resolved = await resolveTabId(deps.chromeApi, tabId);
  if (resolved === undefined) return;

  const pageMeta = await tryExecute(deps.chromeApi, resolved, readPageInPage, 'read page metadata');
  if (pageMeta === INJECT_FAILED || pageMeta === null) return;

  const cfg = await deps.settings.get();
  const screenshotDataUrl = cfg.captureScreenshot
    ? await captureScreenshot(deps.chromeApi)
    : undefined;
  const sourceUrl = cfg.stripTrackingParams
    ? stripTrackingParams(pageMeta.sourceUrl)
    : pageMeta.sourceUrl;

  await persistAndPresent(deps, resolved, cfg, () =>
    deps.records.savePage({
      ...pageMeta,
      sourceUrl,
      ...(screenshotDataUrl !== undefined && { screenshotDataUrl }),
    }),
  );
}

async function persistAndPresent<T extends MmwRecord>(
  deps: SaveFlowDeps,
  tabId: number,
  cfg: Settings,
  doSave: () => Promise<T>,
): Promise<void> {
  try {
    const saved = await doSave();
    emitRecordEvent(deps.chromeApi, { type: 'record:created', record: saved });
    await presentSavedCard(deps, tabId, saved, cfg);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unknown error';
    await infoToast(deps, tabId, `Save failed: ${msg}`, 'error');
  }
}

async function presentSavedCard(
  deps: SaveFlowDeps,
  tabId: number,
  saved: MmwRecord,
  cfg: Settings,
): Promise<void> {
  const allTags = await collectAllTags(deps);
  try {
    await deps.chromeApi.showSaveCard(tabId, {
      recordId: saved.id,
      currentTags: saved.tags ?? [],
      allTags,
      visibleMs: cfg.toastDurationMs,
    });
  } catch (error) {
    console.warn('[mark-my-words] save-card inject failed:', error);
  }
}

async function collectAllTags(deps: SaveFlowDeps): Promise<string[]> {
  const all = await deps.records.list({ archived: false });
  const set = new Set<string>();
  for (const r of all) for (const t of r.tags ?? []) set.add(t);
  return [...set].toSorted();
}

async function captureScreenshot(chromeApi: ChromeApi): Promise<string | undefined> {
  try {
    return await chromeApi.captureVisibleTabJpeg(70);
  } catch (error) {
    console.warn('[mark-my-words] screenshot capture failed:', error);
    return undefined;
  }
}

async function infoToast(
  deps: SaveFlowDeps,
  tabId: number,
  message: string,
  variant: 'info' | 'error' = 'info',
): Promise<void> {
  // For info/error toasts we want them visible *long enough to read* even
  // if the user set toastDurationMs to "Never" (=0) for the success pill.
  const cfg = await deps.settings.get();
  const visibleMs = cfg.toastDurationMs > 0 ? cfg.toastDurationMs : 5000;
  try {
    await deps.chromeApi.showToast(tabId, { variant, message, visibleMs });
  } catch (error) {
    console.warn('[mark-my-words] toast inject failed:', error);
  }
}

async function resolveTabId(
  chromeApi: ChromeApi,
  tabId: number | undefined,
): Promise<number | undefined> {
  if (tabId !== undefined) return tabId;
  return chromeApi.activeTabId();
}

/**
 * Execute a content-script function in the tab and unwrap the result.
 * Returns the function's value, `null` when the script executed but
 * produced no result, or the {@link INJECT_FAILED} sentinel when the
 * chrome.scripting call itself rejected (restricted page, missing tab,
 * etc.). The sentinel keeps callers from confusing "script ran and
 * returned null" with "script never ran".
 */
async function tryExecute<R>(
  chromeApi: ChromeApi,
  tabId: number,
  func: () => R,
  label: string,
): Promise<R | null | InjectFailed> {
  try {
    return await chromeApi.executeInTab(tabId, func);
  } catch (error) {
    console.error(`[mark-my-words] failed to ${label}:`, error);
    return INJECT_FAILED;
  }
}
