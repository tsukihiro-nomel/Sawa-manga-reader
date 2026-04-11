import { memo } from 'react';

function ContextMenu({ menu, onClose }) {
  if (!menu) return null;

  return (
    <div
      className="context-menu-layer"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={onClose}
    >
      <div
        className="context-menu"
        style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
        onMouseDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {menu.items.map((item, index) => {
          if (item.type === 'separator') {
            return <div key={`sep-${index}`} className="context-menu-separator" />;
          }

          return (
            <button
              key={`${item.label}-${index}`}
              className={`context-menu-item ${item.danger ? 'context-menu-item-danger' : ''}`}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              <span className="context-menu-icon">{item.icon}</span>
              <span className="context-menu-label">{item.label}</span>
              {typeof item.checked === 'boolean' && (
                <span className="context-menu-check">{item.checked ? '\u2713' : ''}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(ContextMenu);
