import { describe, expect, it } from 'vitest';
import {
  createPanelFromDrag,
  getPagePanels,
  normalizePanelMap,
  replacePagePanels
} from '../src/utils/guidedView.js';

describe('guided view helpers', () => {
  it('normalizes stored panel maps and keeps page panels addressable', () => {
    const normalized = normalizePanelMap({
      chapterId: 'chapter-1',
      pages: {
        0: {
          panels: [
            { id: 'b', x: 30, y: 10, width: 20, height: 20 },
            { id: 'a', x: 10, y: 10, width: 15, height: 18 }
          ]
        }
      }
    });

    const pagePanels = getPagePanels(normalized, 0);
    expect(pagePanels).toHaveLength(2);
    expect(pagePanels[0].id).toBe('a');
    expect(pagePanels[1].id).toBe('b');
  });

  it('creates a normalized panel from drag bounds and replaces page panels', () => {
    const panel = createPanelFromDrag(
      { x: 100, y: 60 },
      { x: 220, y: 180 },
      { left: 20, top: 20, width: 400, height: 400 },
      0
    );

    expect(panel).toMatchObject({
      label: 'Case 1'
    });
    expect(panel.width).toBeGreaterThan(20);
    expect(panel.height).toBeGreaterThan(20);

    const nextMap = replacePagePanels({ chapterId: 'chapter-1', pages: {} }, 3, [panel]);
    expect(getPagePanels(nextMap, 3)).toHaveLength(1);
    expect(nextMap.chapterId).toBe('chapter-1');
  });
});
