import { expect, test } from './fixtures.js';

test('app page renders empty state', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/app/app.html`);

  await expect(page.getByRole('heading', { name: 'mark-my-words' })).toBeVisible();
  await expect(page.getByText('No records yet.')).toBeVisible();
  await expect(page.getByPlaceholder('Filter records…')).toBeVisible();
});
