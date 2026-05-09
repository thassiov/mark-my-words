// MV3 service worker. Listeners must be registered at module load —
// the worker can be killed and restarted by the browser at any time, and
// any registration that happened after a delay won't be there next wake.
//
// We use chrome.* directly here (no webextension-polyfill) because
// polyfill 0.12.x has known issues registering onMessage listeners
// inside MV3 service workers. Chromium >= 99 supports the legacy
// return-true + sendResponse pattern fine; that's what we use.
// Firefox parity (a stretch goal) can re-introduce the polyfill later.

import pkg from '../../package.json' with { type: 'json' };
import { MAX_SELECTION_CHARS, TOAST_VISIBLE_MS } from '../config.js';
import { readPageInPage } from '../content/read-page.js';
import { readSelectionInPage } from '../content/read-selection.js';
import { showSaveCardInPage } from '../content/save-card.js';
import type { SaveCardArgs } from '../content/save-card.js';
import { showToastInPage } from '../content/show-toast.js';
import type { ToastVariant } from '../content/show-toast.js';
import { errorMessage } from '../lib/error.js';
import { RecordService } from '../records/record-service.js';
import { createDispatcher } from '../shared/dispatcher.js';
import { isMessage } from '../shared/messages.js';
import type { Message, RecordEvent } from '../shared/messages.js';
import type { Record } from '../shared/types.js';
import { IdbRepo } from '../storage/idb-repo.js';

const VERSION = pkg.version || '0.0.0';

console.log(`[mark-my-words] service worker booted (version ${VERSION})`);

const repo = new IdbRepo();
const records = new RecordService(repo);
const dispatch = createDispatcher({ records });

// Wrap dispatch's response in an envelope so the sender can distinguish
// resolved values from thrown errors. chrome.runtime.sendMessage's
// native Promise resolves with whatever the listener returns; without
// an envelope, throws on the SW side become silent rejections on the
// sender side that lose the message.
chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  // Handle save-card click navigation requests (not part of the typed message bus).
  if (isOpenRecordRequest(raw)) {
    void chrome.tabs.create({
      url: `chrome-extension://${chrome.runtime.id}/src/options/options.html#${raw.id}`,
    });
    sendResponse(null);
    return;
  }

  dispatch(raw)
    .then((value) => {
      sendResponse({ ok: true, value });
      if (isMessage(raw)) {
        broadcastRecordEvent(raw, value);
      }
    })
    .catch((err: unknown) => {
      sendResponse({ ok: false, error: errorMessage(err) });
    });
  return true; // keep the message channel open for the async sendResponse
});

// Opening the Library directly from the toolbar icon.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

const CONTEXT_MENU_SAVE_SELECTION_ID = 'mmw-save-selection';
const CONTEXT_MENU_SAVE_PAGE_ID = 'mmw-save-page';

// Re-create the context menu on every SW boot. `removeAll` + `create` is
// idempotent: it works whether the menu was already there (from a prior
// SW lifecycle) or not. Doing this here at module load — rather than
// only in `onInstalled` — ensures the menu exists even when the SW
// wakes after being killed by Chrome between sessions.
//
// Two items, each scoped to its own context: Chromium hides whichever
// doesn't apply, so the user perceives a single "reactive" item that
// changes meaning based on whether text is selected.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_SAVE_SELECTION_ID,
    title: 'Save selection',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: CONTEXT_MENU_SAVE_PAGE_ID,
    title: 'Save page',
    contexts: ['page'],
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[mark-my-words] onInstalled reason=${details.reason} version=${VERSION}`);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-snippet') return;
  // Reactive shortcut: if there's a selection, save it; otherwise save
  // the bare page. Mirrors the right-click menu's behavior.
  void handleSaveSelectionOrPage();
});

async function handleSaveSelectionOrPage(tabId?: number): Promise<void> {
  const resolvedTabId = tabId ?? (await activeTabId());
  if (resolvedTabId === undefined) {
    console.log('[mark-my-words] no active tab');
    return;
  }
  // Probe whether the page has a selection by injecting the existing
  // reader. Null means "nothing selected" — fall through to page save.
  let probed: ReturnType<typeof readSelectionInPage>;
  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId: resolvedTabId },
      func: readSelectionInPage,
    });
    probed = injections[0]?.result ?? null;
  } catch (error) {
    console.error('[mark-my-words] failed to read selection:', error);
    return;
  }
  await (probed === null
    ? handleSavePage(resolvedTabId)
    : handleSaveSelection(resolvedTabId, probed));
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_SAVE_SELECTION_ID) {
    void handleSaveSelection(tab?.id);
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_SAVE_PAGE_ID) {
    void handleSavePage(tab?.id);
  }
});

/**
 * Inject {@link readSelectionInPage} into the given tab (or the active
 * tab if none specified), take its result, and persist it via
 * {@link RecordService.saveSelection}.
 *
 * Failure modes:
 *   - No tab id available → no-op.
 *   - Tab is restricted (chrome://, Web Store, etc.) → executeScript
 *     rejects; we log and bail.
 *   - Empty selection → reader returns null → no-op.
 *   - Save throws → log and show error toast.
 */
async function handleSaveSelection(
  tabId?: number,
  prereadResult?: ReturnType<typeof readSelectionInPage>,
): Promise<void> {
  const resolvedTabId = tabId ?? (await activeTabId());
  if (resolvedTabId === undefined) {
    console.log('[mark-my-words] no active tab');
    return;
  }

  let result: ReturnType<typeof readSelectionInPage>;
  if (prereadResult === undefined) {
    try {
      const injections = await chrome.scripting.executeScript({
        target: { tabId: resolvedTabId },
        func: readSelectionInPage,
      });
      result = injections[0]?.result ?? null;
    } catch (error) {
      console.error('[mark-my-words] failed to read selection:', error);
      // We can't show a toast here because the page rejected our injection
      // (chrome://, Web Store, PDF viewer, etc.). User has no feedback by
      // design — those pages were never going to work anyway.
      return;
    }
  } else {
    result = prereadResult;
  }

  if (result === null) {
    console.log('[mark-my-words] nothing selected');
    await showToast(resolvedTabId, 'info', 'Nothing selected');
    return;
  }

  if (result.selectedText.length > MAX_SELECTION_CHARS) {
    console.log(
      `[mark-my-words] selection too large (${String(result.selectedText.length)} chars)`,
    );
    await showToast(resolvedTabId, 'info', 'Selection too large — try selecting less text');
    return;
  }

  // Capture screenshot BEFORE save so the toast/save flow doesn't
  // visually interfere with the page (toast injection happens later in
  // both the save-success and save-error branches).
  const screenshotDataUrl = await captureScreenshot();

  try {
    const saved = await records.saveSelection({
      ...result,
      ...(screenshotDataUrl !== undefined && { screenshotDataUrl }),
    });
    console.log(`[mark-my-words] saved selection ${saved.id}: ${saved.selectedText.slice(0, 60)}`);
    // Tell any open Library tab so it can update without a refetch. The
    // typed message bus path (popup/options → SW) emits this in
    // broadcastRecordEvent; this path bypasses the dispatcher, so emit
    // directly.
    emitRecordEvent({ type: 'record:created', record: saved });
    await presentSavedCard(resolvedTabId, saved);
  } catch (error) {
    console.error('[mark-my-words] save failed:', error);
    const msg = error instanceof Error ? error.message : 'unknown error';
    await showToast(resolvedTabId, 'error', `Save failed: ${msg}`);
  }
}

/**
 * Inject {@link readPageInPage} into the given tab (or the active tab
 * if none specified) and persist the bare-page metadata via
 * {@link RecordService.savePage}.
 *
 * Mirrors {@link handleSaveSelection}'s failure handling: restricted
 * pages reject the injection silently; save errors surface via toast.
 */
async function handleSavePage(tabId?: number): Promise<void> {
  const resolvedTabId = tabId ?? (await activeTabId());
  if (resolvedTabId === undefined) {
    console.log('[mark-my-words] no active tab');
    return;
  }

  let pageMeta: ReturnType<typeof readPageInPage>;
  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId: resolvedTabId },
      func: readPageInPage,
    });
    const got = injections[0]?.result;
    if (got === undefined) return;
    pageMeta = got;
  } catch (error) {
    console.error('[mark-my-words] failed to read page metadata:', error);
    return;
  }

  const screenshotDataUrl = await captureScreenshot();

  try {
    const saved = await records.savePage({
      ...pageMeta,
      ...(screenshotDataUrl !== undefined && { screenshotDataUrl }),
    });
    console.log(`[mark-my-words] saved page ${saved.id}: ${saved.pageTitle.slice(0, 60)}`);
    emitRecordEvent({ type: 'record:created', record: saved });
    await presentSavedCard(resolvedTabId, saved);
  } catch (error) {
    console.error('[mark-my-words] save failed:', error);
    const msg = error instanceof Error ? error.message : 'unknown error';
    await showToast(resolvedTabId, 'error', `Save failed: ${msg}`);
  }
}

/** Compose card args from a freshly saved record and inject the card. */
async function presentSavedCard(tabId: number, saved: Record): Promise<void> {
  const allTags = await collectAllTags();
  await showCard(tabId, {
    recordId: saved.id,
    currentTags: saved.tags ?? [],
    allTags,
    visibleMs: TOAST_VISIBLE_MS,
  });
}

/**
 * Compute the union of tags across all (non-archived) records, sorted
 * alphabetically. Mirrors the options-page `allTags` derivation so the
 * suggestions row in the save card matches what the Library shows.
 */
async function collectAllTags(): Promise<string[]> {
  const all = await records.list({ archived: false });
  const set = new Set<string>();
  for (const r of all) for (const t of r.tags ?? []) set.add(t);
  return [...set].toSorted();
}

/**
 * Capture the active tab's visible viewport as a JPEG data URL.
 *
 * Uses the browser's own paint, which means the native selection
 * highlight is rendered as part of the image — no canvas overlay
 * redraw needed. Fails gracefully on restricted pages
 * (chrome://, Web Store, etc.).
 *
 * Quality 70 / JPEG keeps each capture under ~150 KB on typical
 * desktop viewports.
 */
async function captureScreenshot(): Promise<string | undefined> {
  try {
    return await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 70 });
  } catch (error) {
    console.warn('[mark-my-words] screenshot capture failed:', error);
    return undefined;
  }
}

/**
 * Inject the toast helper into the given tab. Used for info/error paths
 * (Nothing selected, Selection too large, Save failed) — the success
 * path uses {@link showCard} instead. Failures (restricted pages, missing
 * tab) are swallowed.
 */
async function showToast(
  tabId: number,
  variant: ToastVariant,
  message: string,
  snippetId?: string,
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showToastInPage,
      args: [variant, message, TOAST_VISIBLE_MS, snippetId],
    });
  } catch (error) {
    console.warn('[mark-my-words] toast inject failed:', error);
  }
}

/**
 * Inject the multi-page save card. Used on save success — replaces the
 * old single-line success toast. Failures swallowed for the same reason
 * as `showToast`.
 */
async function showCard(tabId: number, args: SaveCardArgs): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showSaveCardInPage,
      args: [args],
    });
  } catch (error) {
    console.warn('[mark-my-words] save-card inject failed:', error);
  }
}

/**
 * Push a RecordEvent to any open extension pages (e.g. the Library).
 * Errors are suppressed — if no page is listening, sendMessage rejects
 * and we ignore it.
 */
function emitRecordEvent(event: RecordEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    // No listener is the common case (no Library tab open) — swallow.
  });
}

/** Translate a dispatcher-handled message into the right RecordEvent. */
function broadcastRecordEvent(msg: Message, value: unknown): void {
  let event: RecordEvent | null = null;
  switch (msg.type) {
    case 'record:save-selection':
    case 'record:save-page': {
      event = { type: 'record:created', record: value as Record };

      break;
    }
    case 'record:delete': {
      event = { type: 'record:deleted', id: msg.payload.id };

      break;
    }
    case 'record:update':
    case 'record:archive':
    case 'record:unarchive':
    case 'record:add-note':
    case 'record:edit-note':
    case 'record:delete-note': {
      event = { type: 'record:updated', record: value as Record };

      break;
    }
    // No default
  }
  if (event === null) return;
  emitRecordEvent(event);
}

function isOpenRecordRequest(v: unknown): v is { type: 'ui:open-record'; id: string } {
  if (typeof v !== 'object' || v === null) return false;
  // Inline index signature instead of `Record<string, unknown>` — our
  // `Record` type shadows the TS utility.
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  const o = v as { [k: string]: unknown };
  return o['type'] === 'ui:open-record' && typeof o['id'] === 'string';
}
