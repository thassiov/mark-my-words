/**
 * dependency-cruiser configuration — enforces architectural boundaries
 * that the folder layout merely *suggests*. Mirrors the spirit of Go's
 * `internal/` packages: a folder can be public to some modules but
 * forbidden to others.
 *
 * Rules summary:
 *   shared/   — leaf-ish: types, message bus, dispatcher. May import from
 *               itself only. No deps on UI / runtime layers.
 *   storage/  — pure persistence. May import shared/ only.
 *   snippets/ — domain service. May import shared/, storage/.
 *   content/  — page-injected scripts. May import shared/. Must NOT
 *               import from background/, app/, popup/, snippets/,
 *               storage/ (those would pull in modules unavailable in the
 *               injected context).
 *   app/      — UI page (Library + Archived + Settings tabs). Must use
 *               shared/ + send.ts to talk to SW; must NOT import
 *               background/ or content/ runtime files.
 *   popup/    — same constraints as app/.
 *   background/ — composition root for the SW. May import everything
 *                 except UI (app/popup).
 *   lib/      — small utilities; may not import from anything but itself.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Orphan files (not reachable from any entrypoint) should usually be deleted or wired in.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)tsconfig.*\\.json$',
          '(^|/)\\.(eslint|prettier|dependency-cruiser|knip)\\..*$',
          '(^|/)src/manifest\\.ts$',
          '(^|/)scripts/',
          '(^|/)e2e/',
        ],
      },
      to: {},
    },
    {
      name: 'shared-stays-leafy',
      severity: 'error',
      comment:
        'src/shared/ is the message bus + types. It must not pull in UI, content scripts, background, or storage.',
      from: { path: '^src/shared/' },
      to: {
        path: ['^src/app/', '^src/popup/', '^src/background/', '^src/content/', '^src/storage/'],
      },
    },
    {
      name: 'storage-only-shared',
      severity: 'error',
      comment: 'src/storage/ is pure persistence. Only shared/ + lib/ may be imported.',
      from: { path: '^src/storage/' },
      to: {
        path: ['^src/app/', '^src/popup/', '^src/background/', '^src/content/', '^src/snippets/'],
      },
    },
    {
      name: 'content-no-runtime-bleed',
      severity: 'error',
      comment:
        'src/content/ runs in the page context (injected via executeScript). It must not import background/, snippets/, storage/, or any UI module.',
      from: { path: '^src/content/' },
      to: {
        path: ['^src/background/', '^src/snippets/', '^src/storage/', '^src/app/', '^src/popup/'],
      },
    },
    {
      name: 'app-no-direct-sw',
      severity: 'error',
      comment:
        'src/app/ talks to the SW only via shared/messages.ts + send.ts. Importing background/ or content/ directly is a layering violation.',
      from: { path: '^src/app/' },
      to: { path: ['^src/background/', '^src/content/'] },
    },
    {
      name: 'popup-no-direct-sw',
      severity: 'error',
      comment:
        'src/popup/ talks to the SW only via shared/ + send.ts. Importing background/ or content/ directly is a layering violation.',
      from: { path: '^src/popup/' },
      to: { path: ['^src/background/', '^src/content/'] },
    },
    {
      name: 'lib-stays-pure',
      severity: 'error',
      comment: 'src/lib/ is utility-only — no inward deps on anything app-shaped.',
      from: { path: '^src/lib/' },
      to: {
        path: [
          '^src/shared/',
          '^src/snippets/',
          '^src/storage/',
          '^src/app/',
          '^src/popup/',
          '^src/background/',
          '^src/content/',
        ],
      },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Without this, type-only imports (e.g. `import type { Snippet }`)
    // are erased before the dep graph is built, and modules that only
    // export types look orphaned.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    includeOnly: '^src/',
  },
};
