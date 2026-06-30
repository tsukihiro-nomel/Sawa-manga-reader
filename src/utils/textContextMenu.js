export function isTextContextRequest(event, selectedText) {
  const target = event?.target;
  const editable = Boolean(target?.closest?.(
    'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]'
  ));
  const selection = selectedText === undefined
    ? globalThis.getSelection?.()?.toString?.() || ''
    : selectedText;
  return editable || String(selection || '').trim().length > 0;
}
