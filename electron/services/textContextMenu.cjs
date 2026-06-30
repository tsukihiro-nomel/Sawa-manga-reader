function buildTextContextMenuTemplate(params = {}) {
  const editFlags = params.editFlags || {};
  const hasSelection = String(params.selectionText || '').length > 0;

  if (params.isEditable) {
    return [
      { label: 'Couper', role: 'cut', enabled: Boolean(editFlags.canCut) },
      { label: 'Copier', role: 'copy', enabled: Boolean(editFlags.canCopy || hasSelection) },
      { label: 'Coller', role: 'paste', enabled: Boolean(editFlags.canPaste) },
      { type: 'separator' },
      { label: 'Tout selectionner', role: 'selectAll', enabled: editFlags.canSelectAll !== false }
    ];
  }

  return hasSelection
    ? [{ label: 'Copier', role: 'copy', enabled: true }]
    : [];
}

function installTextContextMenu(webContents, Menu, getWindow) {
  if (!webContents?.on || !Menu?.buildFromTemplate) return () => {};

  const handleContextMenu = (event, params = {}) => {
    const template = buildTextContextMenuTemplate(params);
    if (template.length === 0) return;
    event.preventDefault();
    const menu = Menu.buildFromTemplate(template);
    const window = typeof getWindow === 'function' ? getWindow() : undefined;
    menu.popup(window && !window.isDestroyed?.() ? { window } : undefined);
  };

  webContents.on('context-menu', handleContextMenu);
  return () => webContents.removeListener?.('context-menu', handleContextMenu);
}

module.exports = {
  buildTextContextMenuTemplate,
  installTextContextMenu
};
