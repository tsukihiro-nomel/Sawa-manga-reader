import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  createIsolatedProfile,
  fixtureLibraryRoot,
  launchSawa,
  makeFixtureId,
  removeIsolatedProfile
} from './electronFixture.js';

test('une edition peut devenir preferee depuis la fiche canonique', async () => {
  const profile = createIsolatedProfile({ interfaceMode: 'sawa' });
  let running = null;
  try {
    running = await launchSawa(profile);
    await running.page.locator(`${running.librarySelector} [data-manga-id]`).first().click({ position: { x: 24, y: 24 } });
    const panel = running.page.locator('.detail-editions-panel');
    await expect(panel).toContainText(/2 .ditions reli.es/);
    const selector = panel.locator('select');
    const editionIds = await selector.locator('option').evaluateAll((options) => options.map((option) => option.value));
    expect(editionIds).toHaveLength(2);
    await selector.selectOption(editionIds[1]);
    await expect(running.page.locator('.detail-editions-panel')).toBeVisible();
    await running.page.getByRole('button', { name: /finir comme pr.f.r.e/ }).click();
    await expect.poll(async () => {
      const payload = await running.page.evaluate(() => window.mangaAPI.bootstrap());
      return payload.persisted.workGroups['work-e2e']?.preferredEditionId;
    }).toBe(editionIds[1]);
  } finally {
    await running?.application?.close().catch(() => {});
    await removeIsolatedProfile(profile);
  }
});

test('un deplacement reel restaure identite progression et chapitre', async () => {
  test.setTimeout(120_000);
  const profile = createIsolatedProfile({ interfaceMode: 'sawa', mangaCount: 24 });
  let running = null;
  try {
    running = await launchSawa(profile);
    const before = await running.page.evaluate(() => window.mangaAPI.bootstrap());
    const manga = before.library.allMangas.find((entry) => entry.displayTitle === 'Série Fixture 011');
    expect(manga).toBeTruthy();
    const chapter = manga.chapters[0];
    const baseline = await running.page.evaluate(() => window.mangaAPI.analyzeIdentities());
    expect(baseline.ok).toBe(true);

    const saved = await running.page.evaluate(({ mangaId, chapterId }) => window.mangaAPI.updateProgressLight({
      mangaId,
      chapterId,
      pageIndex: 2,
      pageCount: 4,
      mode: 'single',
      fitMode: 'fit-width',
      zoom: 1,
      scrollTop: 0,
      scrollRatio: 0.5
    }), { mangaId: manga.id, chapterId: chapter.id });
    expect(saved.ok).toBe(true);

    const movedPath = path.join(fixtureLibraryRoot(profile), 'Serie Fixture 011 - Deplacee');
    fs.renameSync(manga.path, movedPath);
    const newMangaId = makeFixtureId('manga', movedPath);
    const newChapterPath = path.join(movedPath, 'Chapitre 01');
    const newChapterId = makeFixtureId('chapter', newChapterPath);

    const rescan = await running.page.evaluate(() => window.mangaAPI.forceRescan());
    expect(rescan.ok).toBe(true);
    const analyzed = await running.page.evaluate(() => window.mangaAPI.analyzeIdentities());
    expect(analyzed.ok).toBe(true);

    const after = await running.page.evaluate(() => window.mangaAPI.bootstrap());
    const moved = after.library.allMangas.find((entry) => entry.id === newMangaId);
    console.log(`SAWA_MOVE_EVIDENCE=${JSON.stringify({
      analyzed,
      oldMangaId: manga.id,
      newMangaId,
      oldChapterId: chapter.id,
      newChapterId,
      alias: after.persisted.identityAliases[manga.id],
      progressKeys: Object.keys(after.persisted.progress || {}),
      oldProgress: after.persisted.progress[chapter.id],
      newProgress: after.persisted.progress[newChapterId]
    })}`);
    expect(moved?.path).toBe(movedPath);
    expect(moved?.chapters[0]?.id).toBe(newChapterId);
    expect(after.persisted.progress[newChapterId]).toMatchObject({
      mangaId: newMangaId,
      chapterId: newChapterId,
      pageIndex: 2,
      pageCount: 4
    });
    expect(after.persisted.progress[chapter.id]).toBeUndefined();
    expect(after.persisted.identityAliases[manga.id]).toBe(newMangaId);

    await running.page.evaluate(() => window.mangaAPI.reloadApp());
    await running.page.locator('.app-shell').waitFor({ state: 'visible' });
    const input = running.page.locator('.search-experience input[role="combobox"]').first();
    await input.fill('Série Fixture 011');
    await expect(running.page.locator(`${running.librarySelector} [data-manga-id="${newMangaId}"]`)).toBeVisible();
    await running.page.locator(`${running.librarySelector} [data-manga-id="${newMangaId}"]`).click({ position: { x: 24, y: 24 } });
    await expect(running.page.locator('.detail-view')).toContainText('75%');
  } finally {
    await running?.application?.close().catch(() => {});
    await removeIsolatedProfile(profile);
  }
});
