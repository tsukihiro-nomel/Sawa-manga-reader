import { describe, expect, it, vi } from 'vitest';
import { createSettingsPersistenceController } from '../src/utils/settingsPersistence.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function mergeSettings(current, patch) {
  return {
    ...current,
    ...patch,
    experimental: patch.experimental
      ? { ...(current.experimental || {}), ...patch.experimental }
      : current.experimental
  };
}

describe('settings persistence controller', () => {
  it('rolls back only a failed preview field without changing the other preview controls', async () => {
    let settings = {
      chapterCardSize: 'comfortable',
      pagePreviewSize: 'comfortable',
      previewQuality: 'balanced',
      experimental: {}
    };
    const persist = vi.fn().mockRejectedValue(new Error('disk busy'));
    const controller = createSettingsPersistenceController({
      getSettings: () => settings,
      applyPatch: (patch) => {
        settings = mergeSettings(settings, patch);
      },
      persist
    });

    await controller.update({ pagePreviewSize: 'large' });

    expect(settings).toMatchObject({
      chapterCardSize: 'comfortable',
      pagePreviewSize: 'comfortable',
      previewQuality: 'balanced'
    });
  });

  it('rolls back only failed fields and protects a newer change', async () => {
    let settings = { theme: 'dark-night', cardSize: 'compact', accent: '#000000', experimental: {} };
    const first = deferred();
    const second = deferred();
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const controller = createSettingsPersistenceController({
      getSettings: () => settings,
      applyPatch: (patch) => {
        settings = mergeSettings(settings, patch);
      },
      persist
    });

    const firstUpdate = controller.update({ theme: 'light-paper', accent: '#ffffff' });
    const secondUpdate = controller.update({ accent: '#ff0000', cardSize: 'large' });
    first.reject(new Error('write failed'));
    await firstUpdate;

    expect(settings).toMatchObject({
      theme: 'dark-night',
      accent: '#ff0000',
      cardSize: 'large'
    });
    second.resolve({ ok: true, revision: 12, ui: settings });
    await secondUpdate;
  });

  it('ignores a stale response and never overwrites a newer value for the same field', async () => {
    let settings = { theme: 'dark-night', experimental: {} };
    const older = deferred();
    const newer = deferred();
    const persist = vi.fn()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const controller = createSettingsPersistenceController({
      getSettings: () => settings,
      applyPatch: (patch) => {
        settings = mergeSettings(settings, patch);
      },
      persist
    });

    const firstUpdate = controller.update({ theme: 'light-paper' });
    const secondUpdate = controller.update({ theme: 'neon-city' });
    newer.resolve({ ok: true, revision: 20, ui: { theme: 'neon-city', experimental: {} } });
    await secondUpdate;
    older.resolve({ ok: true, revision: 19, ui: { theme: 'light-paper', experimental: {} } });
    const result = await firstUpdate;

    expect(result.stale).toBe(true);
    expect(settings.theme).toBe('neon-city');
  });

  it('exposes a non-blocking retry after restoring a failed field', async () => {
    let settings = { cardSize: 'compact', experimental: {} };
    let issue = null;
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({ ok: true, revision: 2, ui: { cardSize: 'large', experimental: {} } });
    const controller = createSettingsPersistenceController({
      getSettings: () => settings,
      applyPatch: (patch) => {
        settings = mergeSettings(settings, patch);
      },
      persist,
      onIssue: (next) => {
        issue = next;
      }
    });

    await controller.update({ cardSize: 'large' });
    expect(settings.cardSize).toBe('compact');
    expect(issue).toMatchObject({ kind: 'settings', fields: ['cardSize'] });

    await issue.retry();
    expect(settings.cardSize).toBe('large');
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('invalidates a failed retry when a newer value succeeds', async () => {
    let settings = { theme: 'dark-night', experimental: {} };
    const issues = [];
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('old failed'))
      .mockResolvedValueOnce({ ok: true, revision: 8, ui: { theme: 'neon-city', experimental: {} } });
    const controller = createSettingsPersistenceController({
      getSettings: () => settings,
      applyPatch: (patch) => {
        settings = mergeSettings(settings, patch);
      },
      persist,
      onIssue: (issue) => issues.push(issue),
      onIssueResolved: ({ fields }) => {
        for (let index = issues.length - 1; index >= 0; index -= 1) {
          if (issues[index].fields.some((field) => fields.includes(field))) issues.splice(index, 1);
        }
      }
    });

    await controller.update({ theme: 'light-paper' });
    const staleRetry = issues[0].retry;
    await controller.update({ theme: 'neon-city' });
    expect(issues).toEqual([]);

    const result = await staleRetry();
    expect(result).toMatchObject({ ok: true, stale: true });
    expect(settings.theme).toBe('neon-city');
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('does not create a stale issue when an older failure arrives after newer success', async () => {
    let settings = { theme: 'dark-night', experimental: {} };
    const older = deferred();
    const issues = [];
    const persist = vi.fn()
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce({ ok: true, revision: 12, ui: { theme: 'neon-city', experimental: {} } });
    const controller = createSettingsPersistenceController({
      getSettings: () => settings,
      applyPatch: (patch) => {
        settings = mergeSettings(settings, patch);
      },
      persist,
      onIssue: (issue) => issues.push(issue)
    });

    const oldUpdate = controller.update({ theme: 'light-paper' });
    await controller.update({ theme: 'neon-city' });
    older.reject(new Error('late old failure'));
    await oldUpdate;

    expect(settings.theme).toBe('neon-city');
    expect(issues).toEqual([]);
  });
});
