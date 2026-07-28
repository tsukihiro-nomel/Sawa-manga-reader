import { expect, test } from '@playwright/test';
import {
  createIsolatedProfile,
  launchSawa,
  removeIsolatedProfile
} from './electronFixture.js';

async function openFirstManga(page, librarySelector) {
  const card = page.locator(`${librarySelector} [data-manga-id]`).first();
  await card.click({ position: { x: 24, y: 24 } });
  await expect(page.locator('.detail-view, .kv-series-view').first()).toBeVisible();
}

async function selectPreviewOption(page, label, option) {
  const group = page.getByRole('group', { name: label }).first();
  await expect(group).toBeVisible();
  await group.getByRole('button', { name: option, exact: true }).click();
  await expect(group.getByRole('button', { name: option, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

async function openFirstChapter(page) {
  const kavitaTile = page.locator('.kv-chapter-tile').first();
  if (await kavitaTile.count()) {
    await kavitaTile.click({ position: { x: 30, y: 30 } });
  } else {
    await page.locator('.chapter-grid .chapter-card').first().click();
  }
  await expect(page.locator('.preview-view, .kv-chapter-view').first()).toBeVisible();
}

for (const interfaceMode of ['sawa', 'kavita']) {
  test(`${interfaceMode} conserve tailles et qualite des apercus apres redemarrage`, async () => {
    test.setTimeout(90_000);
    const profile = createIsolatedProfile({ interfaceMode });
    let running = null;
    try {
      running = await launchSawa(profile);
      await openFirstManga(running.page, running.librarySelector);

      await selectPreviewOption(running.page, 'Cartes', 'Large');
      await selectPreviewOption(running.page, /Qualit/, 'Net');
      const chapterGrid = running.page.locator('.chapter-grid, .kv-chapter-grid').first();
      await expect(chapterGrid).toHaveAttribute('data-preview-size', 'large');
      await openFirstChapter(running.page);

      const pageGrid = running.page.locator('.page-preview-grid, .kv-page-preview-grid').first();
      await expect(pageGrid).toBeVisible();
      await selectPreviewOption(running.page, 'Pages', 'Large');
      await expect(pageGrid).toHaveAttribute('data-preview-size', 'large');
      const previewImage = pageGrid.locator('img').first();
      await expect(previewImage).toBeVisible();
      await expect.poll(() => previewImage.evaluate((node) => getComputedStyle(node).objectFit)).toBe('contain');
      await expect.poll(() => previewImage.getAttribute('src')).toMatch(/[?&]q=high(?:&|$)/);

      await running.application.close();
      running = await launchSawa(profile);
      await openFirstManga(running.page, running.librarySelector);
      await expect(running.page.locator('.chapter-grid, .kv-chapter-grid').first()).toHaveAttribute('data-preview-size', 'large');
      await expect(running.page.getByRole('group', { name: /Qualit/ }).first().getByRole('button', { name: 'Net', exact: true }))
        .toHaveAttribute('aria-pressed', 'true');
      await openFirstChapter(running.page);
      await expect(running.page.locator('.page-preview-grid, .kv-page-preview-grid').first()).toHaveAttribute('data-preview-size', 'large');
    } finally {
      await running?.application?.close().catch(() => {});
      await removeIsolatedProfile(profile);
    }
  });
}
