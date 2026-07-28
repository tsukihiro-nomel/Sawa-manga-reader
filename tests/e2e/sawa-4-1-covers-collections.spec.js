import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  createIsolatedProfile,
  launchSawa,
  removeIsolatedProfile
} from './electronFixture.js';

test('le gestionnaire de couvertures copie la source et separe les cadrages', async () => {
  const profile = createIsolatedProfile({ interfaceMode: 'sawa' });
  let running = null;
  try {
    running = await launchSawa(profile);
    const card = running.page.locator(`${running.librarySelector} [data-manga-id]`).first();
    const mangaId = await card.getAttribute('data-manga-id');
    const bootstrap = await running.page.evaluate(() => window.mangaAPI.bootstrap());
    const manga = bootstrap.library.allMangas.find((entry) => entry.id === mangaId);
    expect(manga?.path).toBeTruthy();
    const sourcePage = path.join(manga.path, 'Chapitre 01', '001.png');
    const sourceBefore = fs.readFileSync(sourcePage);

    await card.click({ position: { x: 24, y: 24 } });
    await running.page.getByRole('button', { name: /Couverture/ }).first().click();
    const modal = running.page.locator('.cover-manager-modal');
    await expect(modal).toBeVisible();
    const adopt = modal.getByRole('button', { name: /Utiliser cette page/ }).first();
    await expect(adopt).toBeVisible();
    await adopt.click();
    await expect.poll(async () => {
      const gallery = await running.page.evaluate((id) => window.mangaAPI.listCovers(id), mangaId);
      return gallery.gallery.profile.activeVariantId;
    }).not.toBe('auto');

    const horizontal = modal.getByLabel('Horizontal');
    await horizontal.fill('0.42');
    await horizontal.press('Tab');
    await expect.poll(async () => {
      const gallery = await running.page.evaluate((id) => window.mangaAPI.listCovers(id), mangaId);
      return gallery.gallery.profile.crops.portrait.x;
    }).toBeCloseTo(0.42, 2);

    await modal.getByRole('button', { name: /Banni/ }).click();
    const zoom = modal.getByLabel('Zoom');
    await zoom.fill('1.5');
    await zoom.press('Tab');
    await expect.poll(async () => (
      running.page.evaluate((id) => window.mangaAPI.listCovers(id), mangaId)
    )).toMatchObject({
      gallery: {
        profile: {
          crops: {
            portrait: { x: 0.42 },
            banner: { zoom: 1.5 }
          }
        }
      }
    });

    const finalGallery = await running.page.evaluate((id) => window.mangaAPI.listCovers(id), mangaId);
    const active = finalGallery.gallery.profile.variants.find(
      (variant) => variant.id === finalGallery.gallery.profile.activeVariantId
    );
    expect(path.resolve(active.path).startsWith(path.resolve(profile))).toBe(true);
    expect(path.resolve(active.path).startsWith(path.resolve(manga.path))).toBe(false);
    expect(fs.readFileSync(sourcePage).equals(sourceBefore)).toBe(true);
  } finally {
    await running?.application?.close().catch(() => {});
    await removeIsolatedProfile(profile);
  }
});

test('les quatre apparences de collection ont un apercu direct et la pile persiste', async () => {
  const profile = createIsolatedProfile({ interfaceMode: 'sawa' });
  let running = null;
  try {
    running = await launchSawa(profile);
    await running.page.locator('.sawa-sidebar-nav-menu .ps-menu-button').filter({ hasText: /Collections/ }).click();
    await expect(running.page.locator('.collections-view')).toBeVisible();
    await running.page.getByRole('button', { name: /Nouvelle collection/ }).click();
    const modal = running.page.locator('.modal-panel').filter({ hasText: /Nouvelle collection/ });
    await expect(modal).toBeVisible();
    await modal.getByLabel('Nom de la collection').fill('Apparences E2E');

    const options = [
      [/Mosa/, 'mosaic'],
      [/Banni/, 'banner'],
      [/Couverture unique/, 'single'],
      [/Pile/, 'stack']
    ];
    for (const [buttonName, appearance] of options) {
      await modal.getByRole('button', { name: buttonName }).click();
      await expect(modal.locator('.collection-cover-preview')).toHaveAttribute('data-appearance', appearance);
    }
    await modal.getByRole('button', { name: /Creer/ }).click();
    const card = running.page.locator('.collection-showcase-card').filter({ hasText: 'Apparences E2E' });
    await expect(card).toBeVisible();
    await expect(card.locator('.collection-cover-preview')).toHaveAttribute('data-appearance', 'stack');

    await running.application.close();
    running = await launchSawa(profile);
    await running.page.locator('.sawa-sidebar-nav-menu .ps-menu-button').filter({ hasText: /Collections/ }).click();
    const restored = running.page.locator('.collection-showcase-card').filter({ hasText: 'Apparences E2E' });
    await expect(restored.locator('.collection-cover-preview')).toHaveAttribute('data-appearance', 'stack');
  } finally {
    await running?.application?.close().catch(() => {});
    await removeIsolatedProfile(profile);
  }
});
