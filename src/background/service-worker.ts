// MV3 service worker — top-level wiring only.
//
// Listeners must be registered at module load: the worker can be killed
// and restarted by the browser at any time, and any registration that
// happened after an `await` is not guaranteed to be in place on the
// next wake. All business logic lives in sibling modules
// (`dispatcher`, `save-flow`, `broadcast`, `chrome-api`) and is unit
// tested without ever loading this file.
//
// We use chrome.* directly here (no webextension-polyfill) because
// polyfill 0.12.x has known issues registering onMessage listeners
// inside MV3 service workers. Chromium ≥ 99 supports the legacy
// return-true + sendResponse pattern fine; that's what we use.

import pkg from '../../package.json' with { type: 'json' };
import { errorMessage } from '../lib/error.js';
import { RecordService } from '../records/record-service.js';
import { SettingsService } from '../settings/settings-service.js';
import { createDispatcher } from '../shared/dispatcher.js';
import { isMessage } from '../shared/messages.js';
import { IdbRepo } from '../storage/idb-repo.js';

import { broadcastRecordEvent } from './broadcast.js';
import { realChromeApi } from './chrome-api.js';
import { createSaveFlow } from './save-flow.js';

const VERSION = pkg.version || '0.0.0';
console.log(`[mark-my-words] service worker booted (version ${VERSION})`);

const chromeApi = realChromeApi;
const repo = new IdbRepo();
const records = new RecordService(repo);
const settings = new SettingsService();
const dispatch = createDispatcher({ records });
const saveFlow = createSaveFlow({ chromeApi, records, settings });

const CONTEXT_MENU_SAVE_SELECTION_ID = 'mmw-save-selection';
const CONTEXT_MENU_SAVE_PAGE_ID = 'mmw-save-page';

// Typed message bus from popup / app / content. Wrap the dispatch
// result in an envelope so the sender can distinguish resolved values
// from thrown errors — chrome.runtime.sendMessage's native Promise
// resolves with whatever the listener returns, and without an envelope
// throws on this side become silent rejections that lose the message.
//
// Never mark this listener `async`: Chrome closes the message channel
// because an async fn returns a Promise, not `true`. The handler must
// return `true` synchronously and call `sendResponse` from inside the
// promise chain.
chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  if (isOpenRecordRequest(raw)) {
    void chromeApi.openTab(
      `chrome-extension://${chromeApi.extensionId()}/src/app/app.html#${raw.id}`,
    );
    sendResponse(null);
    return;
  }
  dispatch(raw)
    .then((value) => {
      sendResponse({ ok: true, value });
      if (isMessage(raw)) broadcastRecordEvent(chromeApi, raw, value);
    })
    .catch((err: unknown) => {
      sendResponse({ ok: false, error: errorMessage(err) });
    });
  return true;
});

chrome.action.onClicked.addListener(() => {
  void chromeApi.openAppPage();
});

// Re-create the context menu on every SW boot. `removeAll` + `create`
// is idempotent: it works whether the menu was already there (from a
// prior SW lifecycle) or not. Doing this here at module load — rather
// than only in `onInstalled` — ensures the menu exists even when the
// SW wakes after being killed by Chrome between sessions.
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
  void saveFlow.saveSelectionOrPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_SAVE_SELECTION_ID) {
    void saveFlow.saveSelection(tab?.id);
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_SAVE_PAGE_ID) {
    void saveFlow.savePage(tab?.id);
  }
});

function isOpenRecordRequest(v: unknown): v is { type: 'ui:open-record'; id: string } {
  if (typeof v !== 'object' || v === null) return false;
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  const o = v as { [k: string]: unknown };
  return o['type'] === 'ui:open-record' && typeof o['id'] === 'string';
}
