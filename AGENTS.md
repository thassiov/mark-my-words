# Agent guide — mark-my-words

Instructions and discoveries for AI agents working on this repo.
Read this before touching the test browser or making UI changes.

---

## Test browser

The test rig is a dedicated Chromium driven over CDP via a Playwright
MCP server. Both the agent and the user share the same browser window.

### Launch / stop

```bash
# Build first — the browser loads dist/, not src/
pnpm build

# Launch (creates a timestamped session dir in the workbench)
/storage/dev/personal/tools/test-browser/launch.sh \
  --task mark-my-words \
  --extension /storage/dev/personal/projects/mark-my-words/dist

# Stop when done
/storage/dev/personal/tools/test-browser/stop.sh
```

### Reload after a code change

```bash
pnpm build:reload   # vite build + CDP reload in one step
```

Or manually: navigate to `chrome://extensions`, click the reload (↺)
button on the mark-my-words card.

### Opening extension pages

The options page (Library + Settings) is a full-tab page registered
as `options_ui`. Open it via:

```
chrome-extension://oamhknobaghfeecoocfppladagbfhgmc/src/options/options.html
```

Deep-link to a specific snippet by appending `#<snippet-id>`:

```
chrome-extension://oamhknobaghfeecoocfppladagbfhgmc/src/options/options.html#<id>
```

The popup can be opened directly too (bypasses the toolbar-click
restriction):

```
chrome-extension://oamhknobaghfeecoocfppladagbfhgmc/src/popup/popup.html
```

> **Note:** The extension ID `oamhknobaghfeecoocfppladagbfhgmc` is
> stable across launches as long as the browser profile and extension
> path don't change. A fresh profile regenerates it.

---

## Agent methodology during a test session

### Follow the active tab

The Playwright MCP is tab-scoped — it holds a reference to whichever
tab it last selected. It does **not** receive a CDP event when the user
switches tabs. There is no "follow active tab" config.

**Protocol:** before every `browser_take_screenshot` or
`browser_snapshot`, call `browser_tabs list` first. Select the tab the
user is likely on (the non-extensions tab, or the newest tab). If the
user opens a new tab, they will say so.

```
browser_tabs { action: "list" }
browser_tabs { action: "select", index: N }
browser_take_screenshot / browser_snapshot
```

### Recovering a lost MCP connection

If the browser was stopped and restarted, the MCP's existing tab
references are invalid — calls will fail with "Target page, context or
browser has been closed". Recovery:

1. Call `browser_close` once (clears the stale reference).
2. Call any normal navigation (e.g. `browser_navigate` to `about:blank`).
3. The MCP re-establishes via CDP automatically. Do **not** restart
   Claude Code.

---

## Testing constraints

### Keyboard shortcuts cannot be triggered via Playwright

`page.keyboard.press('Control+Shift+S')` injects the keystroke at the
renderer level. Chrome's extension-command dispatcher runs in the
browser shell and processes shortcuts before they reach the renderer.
So `chrome.commands.onCommand` is **never** fired by Playwright key
events.

Workarounds:
- Verify shortcut registration via `chrome.commands.getAll()` from the
  popup or options page.
- Unit-test the page-side function the shortcut calls.
- Manual smoke: press the chord in the live browser window and inspect
  the result.

### Screenshot capture fails on restricted pages

`chrome.tabs.captureVisibleTab` is rejected on `chrome://`, Web Store,
PDF viewer, and similar restricted origins. The extension handles this
gracefully (saves the snippet without a screenshot). No action needed
during testing — just be aware screenshots won't appear for those pages.

---

## Key source locations

| What | Where |
|---|---|
| Extension config values (toast timeout, etc.) | `src/config.ts` |
| Snippet type + edit shape | `src/shared/types.ts` |
| Message bus (all SW messages) | `src/shared/messages.ts` |
| Service worker (save flow, context menu, shortcuts) | `src/background/service-worker.ts` |
| Library + Settings UI | `src/options/options.tsx` |
| Popup | `src/popup/popup.tsx` |
| Toast injected into pages | `src/content/show-toast.ts` |
| Selection reader injected into pages | `src/content/read-selection.ts` |
