import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BrowserContext, chromium, test as base } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Built extension directory — produced by `pnpm build`. */
const EXTENSION_PATH = path.resolve(dirname, '..', 'dist');

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
}

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      // headless:false lets us pass --headless=new ourselves; required for MV3
      // service worker + extension loading. In CI we run under xvfb-run.
      headless: false,
      args: [
        '--headless=new',
        '--no-sandbox',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await use(id);
  },
});

export const expect = test.expect;
