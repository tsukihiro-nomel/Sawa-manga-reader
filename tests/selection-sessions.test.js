import { describe, expect, it } from 'vitest';
import {
  createSelectionSessionsState,
  getSelectionSession,
  getSelectionSummary,
  makeSelectionSessionKey,
  selectionSessionsReducer
} from '../src/utils/selectionSessions.js';

function reduce(actions) {
  return actions.reduce(selectionSessionsReducer, createSelectionSessionsState());
}

describe('selection sessions', () => {
  it('starts with Ctrl+click and keeps sessions isolated by tab/view/interface', () => {
    const sawa = makeSelectionSessionKey({ interfaceMode: 'sawa', tabId: 'a', view: 'library' });
    const kavita = makeSelectionSessionKey({ interfaceMode: 'kavita', tabId: 'a', view: 'library' });
    const state = reduce([{ type: 'toggle', key: sawa, id: 'm2', ctrlKey: true, orderedIds: ['m1', 'm2'] }]);
    expect(getSelectionSession(state, sawa)).toMatchObject({ mode: true, selectedIds: ['m2'] });
    expect(getSelectionSession(state, kavita)).toEqual(expect.objectContaining({ mode: false, selectedIds: [] }));
  });

  it('selects a stable virtualized range including offscreen ids', () => {
    const key = 'sawa:a:library';
    const orderedIds = Array.from({ length: 100 }, (_, index) => `m${index}`);
    const state = reduce([
      { type: 'toggle', key, id: 'm4', orderedIds },
      { type: 'toggle', key, id: 'm82', shiftKey: true, orderedIds }
    ]);
    const session = getSelectionSession(state, key);
    expect(session.selectedIds).toHaveLength(79);
    expect(session.selectedIds).toContain('m50');
    expect(session.anchorId).toBe('m4');
  });

  it('supports all, invert, clear, exit and reports filtered hidden ids', () => {
    const key = 'sawa:a:favorites';
    let state = reduce([{ type: 'select-all', key, orderedIds: ['a', 'b', 'c'] }]);
    state = selectionSessionsReducer(state, { type: 'invert', key, orderedIds: ['b', 'c', 'd'] });
    expect(getSelectionSession(state, key).selectedIds).toEqual(['a', 'd']);
    expect(getSelectionSummary(getSelectionSession(state, key), ['d'])).toMatchObject({
      selectedCount: 2,
      hiddenCount: 1
    });
    state = selectionSessionsReducer(state, { type: 'clear', key });
    expect(getSelectionSession(state, key)).toMatchObject({ mode: true, selectedIds: [] });
    state = selectionSessionsReducer(state, { type: 'exit', key });
    expect(getSelectionSession(state, key)).toMatchObject({ mode: false, selectedIds: [] });
  });

  it('preserves selection ids when filter ordering changes', () => {
    const key = 'sawa:a:library';
    const state = reduce([
      { type: 'toggle', key, id: 'a', orderedIds: ['a', 'b'] },
      { type: 'toggle', key, id: 'b', orderedIds: ['b', 'a'] }
    ]);
    expect(new Set(getSelectionSession(state, key).selectedIds)).toEqual(new Set(['a', 'b']));
  });
});
