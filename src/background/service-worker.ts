// MV3 service worker. Listeners must be registered at module load —
// the worker can be killed and restarted by the browser at any time, and
// any registration that happened after a delay won't be there next wake.
//
// We use chrome.* directly here (no webextension-polyfill) because
// polyfill 0.12.x has known issues registering onMessage listeners
// inside MV3 service workers. Chromium >= 99 supports Promise-return
// from onMessage natively, which is all we need. Firefox parity (a
// stretch goal) can re-introduce the polyfill later via a small shim.

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
  console.log(`[mark-my-words] command received: ${command}`);
  // Real save handler lands in MARK-7 (content script reads selection
  // and sends 'snippet:save' via the message bus).
});
