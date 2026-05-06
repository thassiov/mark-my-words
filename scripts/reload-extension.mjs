#!/usr/bin/env node
// Reload the loaded MV3 extension in the running test browser.
//
// Connects to Chromium's CDP endpoint and tries, in order:
//   1. The extension's service-worker target → eval `chrome.runtime.reload()`
//      (preferred; cheap and direct)
//   2. A chrome-extension://… page (popup or options) → same eval
//   3. A chrome://extensions/ tab → `chrome.developerPrivate.reload(id)`
//      looked up by package.json `name`. Survives across SW dormancy.
//
// MV3 service workers go dormant after ~30 s of idle and CDP's
// `/json/list` doesn't include dormant SWs. When the SW is asleep
// AND no extension page is open, Strategy 3 is what gets us through.
//
// Earlier attempt via `chrome.management.setEnabled(id, false); …(id, true)`
// failed because disabling triggers a re-render of chrome://extensions
// which terminates the IIFE before re-enable fires, leaving the
// extension disabled. `developerPrivate.reload()` doesn't disable.
//
// Requirements:
//   - Test browser running on the CDP port
//     (launched via /storage/dev/personal/tools/test-browser/launch.sh).
//   - One of: live SW, extension page, or chrome://extensions/ tab.
//   - Node 22+ (uses native fetch + WebSocket).
//
// Env:
//   CDP_HOST  defaults to http://localhost:9222
//   EXT_NAME  extension name for Strategy 3 lookup. Defaults to the
//             package.json `name`.
//
// Exit codes:
//   0  reload sent successfully
//   1  CDP unreachable / no usable target found / WS error

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDP_HOST = process.env.CDP_HOST ?? 'http://localhost:9222';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const EXT_NAME = process.env.EXT_NAME ?? pkg.name;

async function getTargets() {
  try {
    const res = await fetch(`${CDP_HOST}/json/list`);
    return await res.json();
  } catch {
    console.error(`✗ Cannot reach CDP at ${CDP_HOST}`);
    console.error(
      `  Test browser not running? Try: /storage/dev/personal/tools/test-browser/launch.sh --task mark-my-words --extension dist`,
    );
    process.exit(1);
  }
}

function evalOnTarget(target, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          id: id++,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        ws.close();
        if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.exception?.description ?? 'eval error'));
          return;
        }
        resolve(msg.result);
      }
    });
    ws.addEventListener('error', (e) => {
      reject(e);
    });
    // chrome.runtime.reload kills the SW; the WS may close before our
    // resolve fires. That's fine — treat WS close as success.
    ws.addEventListener('close', () => {
      resolve({ closedBeforeAck: true });
    });
  });
}

function reloadViaDeveloperPrivate(extName) {
  // Runs inside chrome://extensions/. `chrome.developerPrivate` is
  // the same API the page itself uses to drive the reload arrow.
  return `
    (async () => {
      const infos = await new Promise((res) =>
        chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, res),
      );
      const ext = infos.find((e) => e.name === ${JSON.stringify(extName)});
      if (!ext) {
        const names = infos.map((e) => e.name).join(', ');
        throw new Error('Extension "${extName}" not found. Loaded: ' + names);
      }
      await new Promise((res, rej) => {
        chrome.developerPrivate.reload(ext.id, { failQuietly: false }, () => {
          if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
          else res();
        });
      });
      return ext.id;
    })()
  `;
}

async function main() {
  const targets = await getTargets();

  // Strategy 1: live SW target
  const sw = targets.find(
    (t) =>
      t.type === 'service_worker' &&
      typeof t.url === 'string' &&
      t.url.startsWith('chrome-extension://'),
  );
  if (sw) {
    console.log(`→ Reload via SW: ${sw.url}`);
    await evalOnTarget(sw, 'chrome.runtime.reload()');
    console.log('✓ Extension reloaded');
    return;
  }

  // Strategy 2: any extension page (popup/options/etc.)
  const extPage = targets.find(
    (t) =>
      t.type === 'page' && typeof t.url === 'string' && t.url.startsWith('chrome-extension://'),
  );
  if (extPage) {
    console.log(`→ Reload via extension page: ${extPage.url}`);
    await evalOnTarget(extPage, 'chrome.runtime.reload()');
    console.log('✓ Extension reloaded (SW was dormant)');
    return;
  }

  // Strategy 3: chrome://extensions/ tab → developerPrivate.reload
  const extensionsPage = targets.find(
    (t) =>
      t.type === 'page' && typeof t.url === 'string' && t.url.startsWith('chrome://extensions'),
  );
  if (extensionsPage) {
    console.log(`→ Reload via chrome://extensions/ (looking for "${EXT_NAME}")`);
    const result = await evalOnTarget(extensionsPage, reloadViaDeveloperPrivate(EXT_NAME));
    if (result?.closedBeforeAck) {
      console.log('✓ Extension reloaded (page navigated before ack)');
    } else {
      console.log(`✓ Extension reloaded (id: ${result?.result?.value ?? 'unknown'})`);
    }
    return;
  }

  console.error('✗ No usable CDP target found.');
  console.error('  Need a live service worker, an extension page, or chrome://extensions/.');
  console.error('  Wake the SW by clicking the toolbar icon, or open chrome://extensions.');
  process.exit(1);
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
