import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfDocumentCache = new Map();
const pdfDataCache = new Map();

function getDocumentCacheKey(filePath) {
  return String(filePath || '');
}

function normalizePdfBinary(payload) {
  if (!payload) return null;
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (Array.isArray(payload)) return new Uint8Array(payload);
  if (payload?.type === 'Buffer' && Array.isArray(payload.data)) {
    return new Uint8Array(payload.data);
  }
  if (typeof payload === 'string') {
    try {
      const binary = window.atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    } catch (_error) {
      return null;
    }
  }
  if (typeof payload?.base64 === 'string') {
    return normalizePdfBinary(payload.base64);
  }
  return null;
}

async function readPdfBinary(filePath) {
  const key = getDocumentCacheKey(filePath);
  if (!key) throw new Error('Missing PDF path');

  if (!pdfDataCache.has(key)) {
    const dataPromise = (async () => {
      const api = window?.mangaAPI;
      if (!api?.readPdfData) {
        throw new Error('PDF binary bridge is unavailable');
      }

      const payload = await api.readPdfData(filePath);
      const bytes = normalizePdfBinary(payload);
      if (!bytes || !bytes.byteLength) {
        throw new Error('Unable to read local PDF data');
      }
      return bytes;
    })().catch((error) => {
      pdfDataCache.delete(key);
      throw error;
    });

    pdfDataCache.set(key, dataPromise);
  }

  return pdfDataCache.get(key);
}

async function loadPdfDocument(filePath) {
  const key = getDocumentCacheKey(filePath);
  if (!key) throw new Error('Missing PDF path');

  if (!pdfDocumentCache.has(key)) {
    const documentPromise = (async () => {
      const data = await readPdfBinary(filePath);
      const loadingTask = pdfjsLib.getDocument({
        data,
        isEvalSupported: false,
        useWorkerFetch: false,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true,
        stopAtErrors: false,
        verbosity: 0
      });

      try {
        return await loadingTask.promise;
      } catch (error) {
        await loadingTask.destroy().catch(() => {});
        throw error;
      }
    })().catch((error) => {
      pdfDocumentCache.delete(key);
      throw error;
    });

    pdfDocumentCache.set(key, documentPromise);
  }

  return pdfDocumentCache.get(key);
}

export async function getPdfPageCount(filePath) {
  const doc = await loadPdfDocument(filePath);
  return Number(doc?.numPages || 0);
}

export async function renderPdfPageToCanvas({
  canvas,
  filePath,
  pageNumber = 1,
  maxWidth = 1200,
  maxHeight = 1600,
  pixelRatio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1,
  background = 'white',
  signal = null
}) {
  if (!canvas || !filePath) return null;

  const doc = await loadPdfDocument(filePath);
  if (signal?.aborted) throw new DOMException('PDF render aborted', 'AbortError');
  const safePageNumber = Math.max(1, Math.min(pageNumber, doc.numPages || 1));
  const page = await doc.getPage(safePageNumber);

  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const widthScale = maxWidth > 0 ? maxWidth / baseViewport.width : 1;
    const heightScale = maxHeight > 0 ? maxHeight / baseViewport.height : 1;
    const renderScale = Math.max(0.15, Math.min(widthScale, heightScale));
    const viewport = page.getViewport({ scale: renderScale });

    const actualPixelRatio = Math.max(1, Number(pixelRatio) || 1);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    canvas.width = Math.max(1, Math.floor(viewport.width * actualPixelRatio));
    canvas.height = Math.max(1, Math.floor(viewport.height * actualPixelRatio));
    canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;

    context.setTransform(actualPixelRatio, 0, 0, actualPixelRatio, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      background
    });

    let abortHandler = null;
    if (signal) {
      abortHandler = () => {
        try { renderTask.cancel(); } catch (_error) {}
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    await renderTask.promise;
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
    if (signal?.aborted) throw new DOMException('PDF render aborted', 'AbortError');
    return {
      width: viewport.width,
      height: viewport.height,
      pageNumber: safePageNumber
    };
  } finally {
    page.cleanup();
  }
}

export function buildPdfPageDescriptor(filePath, index) {
  return {
    id: `pdf-page:${filePath}:${index}`,
    name: `Page ${index + 1}`,
    index,
    path: filePath,
    src: null,
    sourceType: 'pdf',
    pdfPageNumber: index + 1
  };
}
