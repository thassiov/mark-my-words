import { expect, test } from './fixtures.js';
import { makeSelection, openOptionsWith } from './seed.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

test('list renders seeded snippets newest-first', async ({ context, extensionId }) => {
  const page = await openOptionsWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-01-01T10:00:00.000Z',
      selectedText: 'oldest snippet body',
      pageTitle: 'Old Page',
      sourceUrl: 'https://old.example.com/x',
    }),
    makeSelection({
      createdAt: '2026-03-01T10:00:00.000Z',
      selectedText: 'newest snippet body',
      pageTitle: 'New Page',
      sourceUrl: 'https://new.example.com/y',
    }),
  ]);

  await expect(page.getByText('2 snippets saved.')).toBeVisible();

  const cards = page.locator('ul > li');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('newest snippet body');
  await expect(cards.nth(1)).toContainText('oldest snippet body');
});

test('filter narrows by selectedText, title, and hostname', async ({ context, extensionId }) => {
  const page = await openOptionsWith(context, extensionId, [
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

  const filter = page.getByPlaceholder('Filter snippets…');
  const cards = page.locator('ul > li');

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
  const page = await openOptionsWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-10T10:00:00.000Z',
      selectedText: 'detailed selection content',
      contextBefore: 'leading words ',
      contextAfter: ' trailing words',
      pageTitle: 'Detail Page Title',
      sourceUrl: 'https://detail.example.com/path',
    }),
  ]);

  await page.locator('ul > li').first().click();

  const detail = page.getByRole('complementary');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Selection' })).toBeVisible();
  await expect(detail.locator('blockquote')).toContainText('detailed selection content');
  await expect(detail.getByRole('heading', { name: 'In context' })).toBeVisible();
  await expect(detail.locator('mark')).toContainText('detailed selection content');
  await expect(detail).toContainText('leading words');
  await expect(detail).toContainText('trailing words');
  await expect(detail.getByRole('link', { name: 'detail.example.com' })).toBeVisible();
});

test('detail close button hides the pane', async ({ context, extensionId }) => {
  const page = await openOptionsWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-15T10:00:00.000Z',
      selectedText: 'closeable snippet',
    }),
  ]);

  await page.locator('ul > li').first().click();
  await expect(page.getByRole('complementary')).toBeVisible();

  await page.getByRole('button', { name: 'Close detail' }).click();
  await expect(page.getByRole('complementary')).toBeHidden();
});

test('detail pane renders the captured screenshot when present', async ({
  context,
  extensionId,
}) => {
  const page = await openOptionsWith(context, extensionId, [
    makeSelection({
      createdAt: '2026-02-20T10:00:00.000Z',
      selectedText: 'snippet with image',
      screenshotDataUrl: TINY_PNG,
    }),
  ]);

  await page.locator('ul > li').first().click();

  const screenshot = page.getByAltText('Page at the moment of capture');
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute('src', TINY_PNG);
});
