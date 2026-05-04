// MV3 service worker. Listeners must be registered at module load —
// the worker can be killed and restarted by the browser at any time, and
// any registration that happened after a delay won't be there next wake.

import browser from 'webextension-polyfill';

import pkg from '../../package.json' with { type: 'json' };

const VERSION = pkg.version || '0.0.0';

console.log(`[mark-my-words] service worker booted (version ${VERSION})`);

browser.runtime.onInstalled.addListener((details) => {
  console.log(`[mark-my-words] onInstalled reason=${details.reason} version=${VERSION}`);
});

browser.commands.onCommand.addListener((command) => {
  console.log(`[mark-my-words] command received: ${command}`);
  // Real save handler lands in MARK-6 (message bus) and MARK-7 (content script).
  // Today this just confirms the keybinding fires.
});
