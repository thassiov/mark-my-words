#!/usr/bin/env node
// Reload the loaded MV3 extension in the running test browser.
//
// Connects to Chromium's CDP endpoint, finds the extension's service-worker
// target, and evaluates `chrome.runtime.reload()` inside it — which causes
// the browser to reload the extension from disk.
//
// Why this exists: `pnpm build` writes new files to dist/, but the running
// extension keeps its in-memory copy of the service worker until reloaded.
// Without this you must re-launch the test browser or click "Reload" on
// chrome://extensions after every change. The `pnpm build:reload` wrapper
// runs `vite build && this script` so a single command does both.
//
// Requirements:
//   - Test browser running on the CDP port (launched via
//     /storage/dev/personal/tools/test-browser/launch.sh).
//   - Node 22+ (uses native fetch + WebSocket).
//
// Env:
//   CDP_HOST  defaults to http://localhost:9222
//
// Exit codes:
//   0  reload sent successfully
//   1  CDP unreachable / no extension SW found / WS error

const CDP_HOST = process.env.CDP_HOST ?? 'http://localhost:9222';

async function main() {
  let targets;
  try {
    const res = await fetch(`${CDP_HOST}/json/list`);
    targets = await res.json();
  } catch {
    console.error(`✗ Cannot reach CDP at ${CDP_HOST}`);
    console.error(
      `  Test browser not running? Try: /storage/dev/personal/tools/test-browser/launch.sh --task mark-my-words --extension dist`,
    );
    process.exit(1);
  }

  const sw = targets.find(
    (t) =>
      t.type === 'service_worker' &&
      typeof t.url === 'string' &&
      t.url.startsWith('chrome-extension://'),
  );

  if (!sw) {
    console.error(
      `✗ No extension service worker among ${String(targets.length)} CDP targets.`,
    );
    console.error(
      `  Confirm the extension is loaded: launch.sh needs --extension <dist-path>.`,
    );
    process.exit(1);
  }

  console.log(`→ Reloading via SW: ${sw.url}`);

  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => { resolve(); }, { once: true });
    ws.addEventListener('error', (e) => { reject(e); }, { once: true });
  });

  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: 'chrome.runtime.reload()' },
    }),
  );

  // chrome.runtime.reload() kills the SW; no clean ack is expected.
  // A short sleep ensures the message left our buffer before we close.
  await new Promise((res) => setTimeout(res, 200));
  ws.close();
  console.log(`✓ Extension reloaded`);
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
