// MV3 service worker. Listeners must be registered at module load —
// the worker can be killed and restarted by the browser at any time, and
// any registration that happened after a delay won't be there next wake.
//
// We use chrome.* directly here (no webextension-polyfill) because
// polyfill 0.12.x has known issues registering onMessage listeners
// inside MV3 service workers. Chromium >= 99 supports the legacy
// return-true + sendResponse pattern fine; that's what we use.
// Firefox parity (a stretch goal) can re-introduce the polyfill later.

import { readSelectionInPage } from '../content/read-selection.js';
import { showToastInPage } from '../content/show-toast.js';
import type { ToastVariant } from '../content/show-toast.js';
import { createDispatcher } from '../shared/dispatcher.js';
import { SnippetService } from '../snippets/snippet-service.js';
import { BrowserLocalRepo } from '../storage/browser-local-repo.js';
import type { Snippet } from '../shared/types.js';

import pkg from '../../package.json' with { type: 'json' };

const VERSION = pkg.version || '0.0.0';

console.log(`[mark-my-words] service worker booted (version ${VERSION})`);

const repo = new BrowserLocalRepo<Snippet>('mmw.snippet');
const snippets = new SnippetService(repo);
const dispatch = createDispatcher({ snippets });

// Wrap dispatch's response in an envelope so the sender can distinguish
// resolved values from thrown errors. chrome.runtime.sendMessage's
// native Promise resolves with whatever the listener returns; without
// an envelope, throws on the SW side become silent rejections on the
// sender side that lose the message.
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  dispatch(message).then(
    (value) => {
      sendResponse({ ok: true, value });
    },
    (err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error });
    },
  );
  return true; // keep the message channel open for the async sendResponse
});

const CONTEXT_MENU_ID = 'mmw-save-snippet';

// Re-create the context menu on every SW boot. `removeAll` + `create` is
// idempotent: it works whether the menu was already there (from a prior
// SW lifecycle) or not. Doing this here at module load — rather than
// only in `onInstalled` — ensures the menu exists even when the SW
// wakes after being killed by Chrome between sessions.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Save selection as snippet',
    contexts: ['selection'],
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[mark-my-words] onInstalled reason=${details.reason} version=${VERSION}`);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-snippet') return;
  void handleSaveSelection();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  void handleSaveSelection(tab?.id);
});

/**
 * Inject {@link readSelectionInPage} into the given tab (or the active
 * tab if none specified), take its result, and persist it via
 * {@link SnippetService.save}.
 *
 * Failure modes:
 *   - No tab id available → no-op.
 *   - Tab is restricted (chrome://, Web Store, etc.) → executeScript
 *     rejects; we log and bail.
 *   - Empty selection → reader returns null → no-op.
 *   - Save throws → log. (Toast UI lands in MARK-10.)
 */
async function handleSaveSelection(tabId?: number): Promise<void> {
  let resolvedTabId = tabId;
  if (resolvedTabId === undefined) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    resolvedTabId = tab?.id;
  }
  if (resolvedTabId === undefined) {
    console.log('[mark-my-words] no active tab');
    return;
  }

  let result: ReturnType<typeof readSelectionInPage> = null;
  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId: resolvedTabId },
      func: readSelectionInPage,
    });
    result = injections[0]?.result ?? null;
  } catch (err) {
    console.error('[mark-my-words] failed to read selection:', err);
    // We can't show a toast here because the page rejected our injection
    // (chrome://, Web Store, PDF viewer, etc.). User has no feedback by
    // design — those pages were never going to work anyway.
    return;
  }

  if (result === null) {
    console.log('[mark-my-words] nothing selected');
    await showToast(resolvedTabId, 'info', 'Nothing selected');
    return;
  }

  try {
    const saved = await snippets.save(result);
    console.log(`[mark-my-words] saved snippet ${saved.id}: ${saved.selectedText.slice(0, 60)}`);
    await showToast(resolvedTabId, 'success', 'Snippet saved');
  } catch (err) {
    console.error('[mark-my-words] save failed:', err);
    const msg = err instanceof Error ? err.message : 'unknown error';
    await showToast(resolvedTabId, 'error', `Save failed: ${msg}`);
  }
}

/**
 * Inject the toast helper into the given tab. Failures (restricted
 * pages, missing tab) are swallowed — a missing toast is annoying but
 * not a real failure mode.
 */
async function showToast(tabId: number, variant: ToastVariant, message: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showToastInPage,
      args: [variant, message],
    });
  } catch (err) {
    console.warn('[mark-my-words] toast inject failed:', err);
  }
}
