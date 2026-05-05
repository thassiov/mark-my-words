# mark-my-words

> Personal browser tool to save text selections from any web page locally.

**Status:** alpha · WIP · do not depend on this.

A WebExtension (Manifest V3) that lets you highlight any text on a web
page, save it as a snippet with the source URL, page title, surrounding
context, a screenshot of the page, and a timestamp. All data is stored
locally in IndexedDB. No accounts, no servers, no telemetry.

For architecture, message flow diagrams, file map, and dev workflow
internals, see [docs/architecture.md](docs/architecture.md).

## Quick start

```bash
pnpm install
pnpm build      # produces dist/
```

Load the unpacked extension:

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Pick the `dist/` directory

## Usage

- Select text on any page → right-click → **Save selection as snippet**
- Or with text selected, press `Ctrl+Shift+S` (`Cmd+Shift+S` on macOS)
- A toast confirms the save
- Click the toolbar icon for the recent-snippets popup
- Right-click the icon → **Options** for the full browser
  (list + filter + detail pane with screenshot)

## Development

Requires Node 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev          # vite dev server
pnpm test         # vitest unit tests
pnpm e2e:build    # build + Playwright e2e
pnpm typecheck
pnpm build:reload # build + reload running test browser via CDP
```

The test browser lives at `/storage/dev/personal/tools/test-browser/`.
Launch it with the extension loaded:

```bash
/storage/dev/personal/tools/test-browser/launch.sh \
  --task mark-my-words --extension /storage/dev/personal/projects/mark-my-words/dist
```

Project notes and per-task investigation files live in
`/storage/dev/personal/workbench/dev/mark-my-words/`.

## Stack

- WebExtension Manifest V3 (Chromium-first)
- TypeScript strict
- Vite + `@crxjs/vite-plugin`
- Preact + Tailwind v4 (popup and options page)
- Dexie / IndexedDB for storage
- Vitest + happy-dom for units; Playwright for e2e

## License

MIT — see [LICENSE](LICENSE).
