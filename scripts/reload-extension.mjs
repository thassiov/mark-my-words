#!/usr/bin/env node
// Reload the loaded MV3 extension in the running test browser.
//
// Connects to Chromium's CDP endpoint and tries, in order:
//   1. The extension's service-worker target → eval `chrome.runtime.reload()`
//      (preferred; cheap and direct)
//   2. A chrome-extension://… page (popup or options) → same eval
//
// MV3 service workers go dormant after ~30 s of idle and CDP's
// `/json/list` doesn't include dormant SWs. When the SW is asleep,
// having any extension page open (the popup or options) is enough.
//
// Tried a third strategy via chrome://extensions
// `chrome.management.setEnabled(id, false); setEnabled(id, true)`
// but the disable triggers a re-render of the chrome://extensions
// page which terminates the running JS mid-IIFE — re-enable never
// fires and the extension is left disabled. Removed.
//
// Requirements:
//   - Test browser running on the CDP port
//     (launched via /storage/dev/personal/tools/test-browser/launch.sh).
//   - At least ONE of: live SW, an extension page, or a chrome://extensions
//     tab (any one is enough). Most iteration flows have one of these.
//   - Node 22+ (uses native fetch + WebSocket).
//
// Env:
//   CDP_HOST  defaults to http://localhost:9222
//   EXT_NAME  fallback strategy looks up this extension via
//             chrome.management. Defaults to the package.json `name`.
//
// Exit codes:
//   0  reload sent successfully
//   1  CDP unreachable / no usable target found / WS error

const CDP_HOST = process.env.CDP_HOST ?? 'http://localhost:9222';

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
      t.type === 'page' &&
      typeof t.url === 'string' &&
      t.url.startsWith('chrome-extension://'),
  );
  if (extPage) {
    console.log(`→ Reload via extension page: ${extPage.url}`);
    await evalOnTarget(extPage, 'chrome.runtime.reload()');
    console.log('✓ Extension reloaded (SW was dormant)');
    return;
  }

  console.error('✗ No usable CDP target found.');
  console.error('  Need either a live service worker or an extension page open.');
  console.error('  Wake the SW by clicking the toolbar icon (opens the popup), then re-run.');
  console.error('  Or click "Reload" on chrome://extensions manually.');
  process.exit(1);
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
