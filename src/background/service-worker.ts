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

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[mark-my-words] onInstalled reason=${details.reason} version=${VERSION}`);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-snippet') return;
  void handleSaveSelection();
});

/**
 * Inject {@link readSelectionInPage} into the active tab, take its
 * result, and persist it via {@link SnippetService.save}.
 *
 * Failure modes:
 *   - No active tab → no-op.
 *   - Tab is restricted (chrome://, Web Store, etc.) → executeScript
 *     rejects; we log and bail.
 *   - Empty selection → reader returns null → no-op.
 *   - Save throws → log; toast UI lands in MARK-10.
 */
async function handleSaveSelection(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    console.log('[mark-my-words] no active tab');
    return;
  }

  let result: ReturnType<typeof readSelectionInPage> = null;
  try {
    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readSelectionInPage,
    });
    result = injections[0]?.result ?? null;
  } catch (err) {
    console.error('[mark-my-words] failed to read selection:', err);
    return;
  }

  if (result === null) {
    console.log('[mark-my-words] nothing selected');
    return;
  }

  try {
    const saved = await snippets.save(result);
    console.log(`[mark-my-words] saved snippet ${saved.id}: ${saved.selectedText.slice(0, 60)}`);
  } catch (err) {
    console.error('[mark-my-words] save failed:', err);
  }
}
