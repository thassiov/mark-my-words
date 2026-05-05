import { type BrowserContext, expect, type Page } from '@playwright/test';

import type { Snippet } from '../src/shared/types.js';

/**
 * Open the options page, wait for it to finish its initial load
 * (so Dexie has fully initialized its DB schema), seed records via
 * raw IDB, then reload so the App picks them up.
 */
export async function openOptionsWith(
  context: BrowserContext,
  extensionId: string,
  snippets: Snippet[],
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  // Wait for the initial empty-load to complete — guarantees the SW's
  // Dexie open() has finished before raw IDB writes happen.
  await expect(page.getByText('No snippets yet.')).toBeVisible();
  if (snippets.length > 0) {
    await seedSnippets(page, snippets);
    await page.reload();
  }
  return page;
}

/**
 * Wipe + seed the extension's IndexedDB. Must run on a page already
 * served from the extension origin so the IDB scope matches the
 * service worker's view.
 *
 * The DB ('mmw' / store 'snippets') is created by Dexie when the SW
 * first reads. We open at version 1 with the same `keyPath: 'id'`
 * shape — if Dexie already created the DB this is a no-op upgrade.
 */
export async function seedSnippets(page: Page, snippets: Snippet[]): Promise<void> {
  await page.evaluate(async (records) => {
    // Open without specifying a version — Dexie may have created the
    // DB at a higher version with internal metadata stores; we don't
    // want to trigger an upgrade.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('mmw');
      req.addEventListener('error', () => {
        reject(req.error);
      });
      req.addEventListener('success', () => {
        const db = req.result;
        const tx = db.transaction('snippets', 'readwrite');
        const store = tx.objectStore('snippets');
        store.clear();
        for (const r of records) store.put(r);
        tx.addEventListener('complete', () => {
          db.close();
          resolve();
        });
        tx.addEventListener('error', () => {
          reject(tx.error);
        });
      });
    });
  }, snippets);
}

/**
 * Build a Snippet with sensible defaults; override any field via `overrides`.
 * IDs derive from createdAt so they sort the same way the service does.
 */
export function makeSnippet(overrides: Partial<Snippet> & Pick<Snippet, 'createdAt'>): Snippet {
  const { createdAt, id, updatedAt, ...rest } = overrides;
  return {
    id: id ?? `id-${createdAt}`,
    selectedText: 'sample selected text',
    contextBefore: 'before-context ',
    contextAfter: ' after-context',
    sourceUrl: 'https://example.com/article',
    pageTitle: 'Example Article',
    ...rest,
    createdAt,
    updatedAt: updatedAt ?? createdAt,
  };
}
