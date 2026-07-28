import { expect, test } from '@playwright/test';
import {
  createIsolatedProfile,
  launchSawa,
  readScrollSnapshot,
  removeIsolatedProfile,
  scrollToStableOffset
} from './electronFixture.js';

async function expectRestored(page, librarySelector, expected) {
  await expect.poll(async () => {
    const current = await readScrollSnapshot(page, librarySelector);
    return current.anchorId === expected.anchorId
      && Math.abs(current.scrollTop - expected.scrollTop) <= 2;
  }).toBe(true);
  return readScrollSnapshot(page, librarySelector);
}

async function firstFullyVisibleMangaId(page, librarySelector) {
  return page.locator(`${librarySelector} [data-manga-id]`).evaluateAll((cards, selector) => {
    const viewport = document.querySelector(selector)?.getBoundingClientRect();
    if (!viewport) return null;
    return cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return rect.top >= viewport.top + 2 && rect.bottom <= viewport.bottom - 2;
    })?.getAttribute('data-manga-id') || null;
  }, librarySelector);
}

test('Sawa conserve l ancre sur clic molette, retour, onglet et redemarrage', async () => {
  const profile = createIsolatedProfile({ interfaceMode: 'sawa', diagnostics: true });
  let running = null;
  try {
    running = await launchSawa(profile);
    const { page, librarySelector } = running;
    const before = await scrollToStableOffset(page, librarySelector);
    expect(before.scrollTop).toBeGreaterThan(1000);
    expect(before.anchorId).toBeTruthy();

    const activeTabBefore = await page.locator('.titlebar-tabs-layout .browser-tab-active').getAttribute('data-tab-id');
    const tabsBefore = await page.locator('.titlebar-tabs-layout [data-tab-id]').count();
    const clickableMangaId = await firstFullyVisibleMangaId(page, librarySelector);
    expect(clickableMangaId).toBeTruthy();
    const clickableCard = page.locator(`${librarySelector} [data-manga-id="${clickableMangaId}"]`).first();
    await clickableCard.click({ button: 'middle', position: { x: 24, y: 24 } });
    await expect(page.locator('.titlebar-tabs-layout [data-tab-id]')).toHaveCount(tabsBefore + 1);
    await expect(page.locator('.titlebar-tabs-layout .browser-tab-active')).toHaveAttribute('data-tab-id', activeTabBefore);
    await expectRestored(page, librarySelector, before);

    await clickableCard.click({ button: 'left', position: { x: 24, y: 24 } });
    await expect(page.locator('.detail-view')).toBeVisible();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.locator(librarySelector)).toBeVisible();
    await expectRestored(page, librarySelector, before);

    const tabIds = await page.locator('.titlebar-tabs-layout [data-tab-id]').evaluateAll((tabs) => (
      tabs.map((tab) => tab.getAttribute('data-tab-id')).filter(Boolean)
    ));
    const backgroundTabId = tabIds.find((tabId) => tabId !== activeTabBefore);
    expect(backgroundTabId).toBeTruthy();
    await page.locator(`.titlebar-tabs-layout [data-tab-id="${backgroundTabId}"]`).click();
    await expect(page.locator('.detail-view')).toBeVisible();
    await page.locator(`.titlebar-tabs-layout [data-tab-id="${activeTabBefore}"]`).click();
    await expect(page.locator(librarySelector)).toBeVisible();
    await expectRestored(page, librarySelector, before);

    await page.waitForTimeout(1100);
    await running.application.close();
    running = await launchSawa(profile);
    await expectRestored(running.page, running.librarySelector, before);
  } finally {
    await running?.application?.close().catch(() => {});
    await removeIsolatedProfile(profile);
  }
});

test('Kavita conserve l ancre pendant une ouverture en arriere-plan', async () => {
  const profile = createIsolatedProfile({ interfaceMode: 'kavita', diagnostics: true });
  let running = null;
  try {
    running = await launchSawa(profile);
    const before = await scrollToStableOffset(running.page, running.librarySelector, 2400);
    expect(before.anchorId).toBeTruthy();
    const clickableMangaId = await firstFullyVisibleMangaId(running.page, running.librarySelector);
    expect(clickableMangaId).toBeTruthy();
    const card = running.page.locator(`${running.librarySelector} [data-manga-id="${clickableMangaId}"]`).first();
    await card.click({ button: 'middle', position: { x: 20, y: 20 } });
    await expectRestored(running.page, running.librarySelector, before);
  } finally {
    await running?.application?.close().catch(() => {});
    await removeIsolatedProfile(profile);
  }
});
