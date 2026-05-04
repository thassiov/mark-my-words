#!/usr/bin/env node
// Reload the loaded MV3 extension in the running test browser.
//
// Connects to Chromium's CDP endpoint and tries, in order:
//   1. The extension's service-worker target → eval `chrome.runtime.reload()`
//      (preferred; cheap and direct)
//   2. A chrome-extension://… page (popup or options) → same eval
//   3. A chrome://extensions tab → eval `chrome.management.setEnabled` toggle
//      to disable+enable the extension by name
//
// Why three strategies: MV3 service workers go dormant after ~30 s of
// idle and CDP's `/json/list` doesn't include dormant SWs. When the SW
// is asleep we still want a reload to "just work" without the user
// having to open the popup first.
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

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CDP_HOST = process.env.CDP_HOST ?? 'http://localhost:9222';

async function getExtensionName() {
  if (process.env.EXT_NAME) return process.env.EXT_NAME;
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(
    await readFile(join(__dirname, '..', 'package.json'), 'utf8'),
  );
  return pkg.name;
}

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

  // Strategy 3: chrome://extensions toggle by name
  const extTab = targets.find(
    (t) => t.type === 'page' && t.url === 'chrome://extensions/',
  );
  if (extTab) {
    const name = await getExtensionName();
    console.log(`→ Reload via chrome://extensions toggling "${name}"`);
    const expr = `
      (async () => {
        const all = await chrome.management.getAll();
        const ext = all.find(e => e.name === ${JSON.stringify(name)});
        if (!ext) throw new Error('No extension named ' + ${JSON.stringify(name)});
        await new Promise(r => chrome.management.setEnabled(ext.id, false, r));
        await new Promise(r => chrome.management.setEnabled(ext.id, true, r));
        return ext.id;
      })()
    `;
    await evalOnTarget(extTab, expr);
    console.log('✓ Extension reloaded (SW was dormant)');
    return;
  }

  console.error('✗ No usable CDP target found.');
  console.error('  At least one is required:');
  console.error('    - a live extension service worker');
  console.error('    - an extension page (popup or options) open');
  console.error('    - a chrome://extensions tab open');
  console.error('  Open one of those and re-run.');
  process.exit(1);
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
