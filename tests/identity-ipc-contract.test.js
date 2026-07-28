import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('identity and works IPC contract', () => {
  it('keeps validated invoke handlers behind narrow preload methods', () => {
    const main = read('electron/main.cjs');
    const preload = read('electron/preload.cjs');
    [
      'identity:listSuggestions',
      'identity:analyze',
      'identity:decideSuggestion',
      'works:groupEditions',
      'works:ungroup',
      'works:setPreferredEdition'
    ].forEach((channel) => expect(main).toContain(`ipcMain.handle('${channel}'`));
    [
      'listIdentitySuggestions',
      'analyzeIdentities',
      'decideIdentitySuggestion',
      'groupEditions',
      'ungroupEditions',
      'setPreferredEdition'
    ].forEach((method) => expect(preload).toContain(`${method}:`));
    expect(main).toContain('.slice(0, 24)');
    expect(main).toContain('suggestionId.length > 160');
  });

  it('returns revisioned lightweight patches instead of full bootstrap payloads', () => {
    const main = read('electron/main.cjs');
    const identityRegion = main.slice(
      main.indexOf("ipcMain.handle('identity:listSuggestions'"),
      main.indexOf("ipcMain.handle('jobs:list'")
    );
    expect(identityRegion).toContain('revision: stateRevision');
    expect(identityRegion).toContain('patch:');
    expect(identityRegion).not.toContain('buildInteractivePayload(');
  });

  it('returns all organization segments changed by group and ungroup', () => {
    const main = read('electron/main.cjs');
    const patchHelper = main.slice(
      main.indexOf('function buildWorkOrganizationPatch'),
      main.indexOf("ipcMain.handle('identity:analyze'")
    );
    expect(patchHelper).toContain('workGroups:');
    expect(patchHelper).toContain('favorites:');
    expect(patchHelper).toContain('mangaTags:');
    expect(patchHelper).toContain('collections:');
    const worksRegion = main.slice(
      main.indexOf("ipcMain.handle('works:groupEditions'"),
      main.indexOf("ipcMain.handle('works:setPreferredEdition'")
    );
    expect(worksRegion.match(/patch: buildWorkOrganizationPatch\(\)/g)).toHaveLength(2);
  });

  it('routes bootstrap and every identity mutation through the vault-safe client state', () => {
    const main = read('electron/main.cjs');
    const privacyRegion = main.slice(
      main.indexOf('function stripPrivateContentFromPersistedState'),
      main.indexOf('function buildClientPersistedState')
    );
    expect(privacyRegion).toContain('stripPrivateIdentityState(clientState, allPrivateIds)');
    const identityRegion = main.slice(
      main.indexOf('function getClientIdentityState'),
      main.indexOf("ipcMain.handle('jobs:list'")
    );
    expect(identityRegion).toContain('buildClientPersistedState(');
    expect(identityRegion).toContain('assertVisibleWorkMutation({ mangaIds })');
    expect(identityRegion).toContain('assertVisibleWorkMutation({ groupId: normalizedGroupId })');
    expect(identityRegion).toContain('assertVisibleWorkMutation({ mangaIds: [mangaId], groupId })');
    expect(identityRegion).not.toContain('suggestions: identityService.listSuggestions()');
    expect(identityRegion).not.toContain('patch: { workGroups: loadState().workGroups');
  });

  it('derives identity privacy from private categories even while the vault is unlocked', () => {
    const main = read('electron/main.cjs');
    const identityMangasRegion = main.slice(
      main.indexOf('function getIdentityMangas'),
      main.indexOf('function getIdentityAnalysisContextSignature')
    );
    expect(identityMangasRegion).toContain('buildVaultPrivacyModel(');
    expect(identityMangasRegion).toContain(').allPrivateIds');
    expect(identityMangasRegion).not.toContain('state?.vault?.privateMangaIds');
    const mutationGuard = main.slice(
      main.indexOf('function assertVisibleWorkMutation'),
      main.indexOf("ipcMain.handle('identity:listSuggestions'")
    );
    expect(mutationGuard).toContain('if (hasPrivate && hasPublic)');
    expect(mutationGuard.indexOf('if (hasPrivate && hasPublic)'))
      .toBeLessThan(mutationGuard.indexOf('isVaultLocked(state)'));
  });
});
