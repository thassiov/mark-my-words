# mark-my-words

> Personal browser tool to save text selections from any web page locally.

**Status:** alpha · WIP · do not depend on this.

A WebExtension (Manifest V3) that lets you highlight any text on a web
page, save it as a snippet with the source URL + timestamp + a few lines
of context, and find it later. All data is stored locally; no accounts,
no servers, no telemetry.

## Quick start

```bash
pnpm install
pnpm dev    # vite dev server with hot reload
pnpm build  # produces dist/ — load as an unpacked extension in Chrome
```

To load the unpacked extension:

1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Pick the `dist/` directory

## Usage

Once installed:

- Highlight text on any page
- Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac) — _coming in MARK-7_
- Click the extension icon to see your saved snippets — _coming in MARK-8_

## Development

Requires Node 22+ and pnpm 9+.

```bash
pnpm install
pnpm ci          # full pipeline: format-check + lint + typecheck + test + build
pnpm test:watch  # tests in watch mode
```

Project specs and methodology live in
`/storage/dev/personal/workbench/dev/mark-my-words/`.

## Stack

- WebExtension Manifest V3 (Chromium-first; Firefox parity stretch goal)
- TypeScript strict
- Vite + `@crxjs/vite-plugin`
- Preact for the popup UI
- Vitest with `happy-dom` for unit tests
- Per [code-standards/node](../code-standards/node/) and
  [topics/browser-extension.md](../code-standards/node/topics/browser-extension.md)

## License

MIT — see [LICENSE](LICENSE).
