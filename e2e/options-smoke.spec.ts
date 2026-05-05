import { expect, test } from './fixtures.js';

test('options page renders empty state', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);

  await expect(page.getByRole('heading', { name: 'mark-my-words' })).toBeVisible();
  await expect(page.getByText('No snippets yet.')).toBeVisible();
  await expect(page.getByPlaceholder('Filter snippets…')).toBeVisible();
});
