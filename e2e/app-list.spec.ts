import { expect, test } from './fixtures.js';
import { makeSelection, openAppWith } from './seed.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

test('list renders seeded records newest-first', async ({ context, extensionId }) => {
  const page = await openAppWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-01-01T10:00:00.000Z',
      selectedText: 'oldest record body',
      pageTitle: 'Old Page',
      sourceUrl: 'https://old.example.com/x',
    }),
    makeSelection({
      createdAt: '2026-03-01T10:00:00.000Z',
      selectedText: 'newest record body',
      pageTitle: 'New Page',
      sourceUrl: 'https://new.example.com/y',
    }),
  ]);

  await expect(page.getByText('2 records.')).toBeVisible();

  const cards = page.locator('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('newest record body');
  await expect(cards.nth(1)).toContainText('oldest record body');
});

test('filter narrows by selectedText, title, and hostname', async ({ context, extensionId }) => {
  const page = await openAppWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-01T10:00:00.000Z',
      selectedText: 'apples are red',
      pageTitle: 'Fruits',
      sourceUrl: 'https://orchard.example.com/a',
    }),
    makeSelection({
      createdAt: '2026-02-02T10:00:00.000Z',
      selectedText: 'bananas are yellow',
      pageTitle: 'Tropical',
      sourceUrl: 'https://tropics.example.com/b',
    }),
    makeSelection({
      createdAt: '2026-02-03T10:00:00.000Z',
      selectedText: 'kale is green',
      pageTitle: 'Greens',
      sourceUrl: 'https://greens.example.com/c',
    }),
  ]);

  const filter = page.getByPlaceholder('Filter records…');
  const cards = page.locator('article');

  await filter.fill('banana');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('bananas are yellow');

  await filter.fill('Greens');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('kale is green');

  await filter.fill('orchard.example.com');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('apples are red');

  await filter.fill('zzzz-nope');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('No matches for "zzzz-nope".')).toBeVisible();
});

test('clicking a card opens the detail pane with text and metadata', async ({
  context,
  extensionId,
}) => {
  const page = await openAppWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-10T10:00:00.000Z',
      selectedText: 'detailed selection content',
      contextBefore: 'leading words ',
      contextAfter: ' trailing words',
      pageTitle: 'Detail Page Title',
      sourceUrl: 'https://detail.example.com/path',
    }),
  ]);

  await page.locator('article').first().click();

  const detail = page.getByRole('complementary');
  await expect(detail).toBeVisible();
  // Selection metadata row now reads "Selection: N words" (no heading).
  await expect(detail).toContainText('Selection: 3 words');
  await expect(detail.locator('blockquote')).toContainText('detailed selection content');

  // Expand the "In context" collapsible to assert on highlighted body.
  await detail.locator('summary', { hasText: 'In context' }).click();
  await expect(detail.locator('mark')).toContainText('detailed selection content');
  await expect(detail).toContainText('leading words');
  await expect(detail).toContainText('trailing words');

  // The source link uses the hostname as visible text.
  await expect(detail.getByRole('link', { name: 'detail.example.com' })).toBeVisible();
});

test('detail close button hides the pane', async ({ context, extensionId }) => {
  const page = await openAppWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-15T10:00:00.000Z',
      selectedText: 'closeable record',
    }),
  ]);

  await page.locator('article').first().click();
  await expect(page.getByRole('complementary')).toBeVisible();

  await page.getByRole('button', { name: 'Close panel' }).click();
  // Sheet keeps the node mounted for its slide-out transition; assert it
  // leaves the DOM after the ~220ms unmount delay.
  await expect(page.getByRole('complementary')).toHaveCount(0, { timeout: 2000 });
});

test('detail pane renders the captured screenshot when present', async ({
  context,
  extensionId,
}) => {
  const page = await openAppWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-20T10:00:00.000Z',
      selectedText: 'record with image',
      screenshotDataUrl: TINY_PNG,
    }),
  ]);

  await page.locator('article').first().click();

  const detail = page.getByRole('complementary');
  // Screenshot lives inside a collapsible <details>, default closed —
  // expand it before asserting visibility.
  await detail.locator('summary', { hasText: 'Screenshot' }).click();
  const screenshot = detail.getByAltText('Page at the moment of capture');
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('src', TINY_PNG);
});
