import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TagManagerModal from '../src/components/TagManagerModal.jsx';

globalThis.React = React;

describe('TagManagerModal', () => {
  it('does not render delete controls as nested buttons inside tag chips', () => {
    const html = renderToStaticMarkup(
      React.createElement(TagManagerModal, {
        manga: {
          id: 'manga-1',
          displayTitle: 'Manga test',
          tags: [{ id: 'tag-action', name: 'Action', color: '#ef4444' }]
        },
        allTags: {
          'tag-action': { id: 'tag-action', name: 'Action', color: '#ef4444' }
        },
        onToggleTag: () => {},
        onCreateTag: () => {},
        onDeleteTag: () => {},
        onClose: () => {}
      })
    );

    expect(html).not.toMatch(/<button[^>]*class="(?:[^"]*\s)?tag-chip(?:\s|")/);
  });
});
