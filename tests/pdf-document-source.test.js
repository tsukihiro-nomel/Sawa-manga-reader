import { describe, expect, it } from 'vitest';

import { buildPdfDocumentSource } from '../src/utils/pdf.js';

describe('PDF document source', () => {
  it('uses the local document protocol instead of an IPC base64 payload', () => {
    const source = buildPdfDocumentSource('C:/Manga/Magazine Volume 1.pdf');

    expect(source.url).toBe('manga://local/C%3A%2FManga%2FMagazine%20Volume%201.pdf');
    expect(source).not.toHaveProperty('data');
    expect(source.disableRange).toBe(false);
    expect(source.disableStream).toBe(false);
    expect(source.disableAutoFetch).toBe(false);
  });
});
