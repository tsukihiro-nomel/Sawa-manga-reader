import React, { memo } from 'react';
import {
  PREVIEW_QUALITY_OPTIONS,
  PREVIEW_SIZE_OPTIONS,
  normalizePreviewQuality,
  normalizePreviewSize
} from '../utils/previewQuality.js';

function OptionButtons({ label, value, options, onChange }) {
  return (
    <div className="preview-display-control" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="preview-display-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? 'is-active' : ''}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewDisplayControls({
  kind = 'page',
  size,
  quality,
  onSizeChange,
  onQualityChange,
  showQuality = true,
  compact = false
}) {
  return (
    <div className={`preview-display-controls ${compact ? 'is-compact' : ''}`.trim()}>
      <OptionButtons
        label={kind === 'chapter' ? 'Cartes' : 'Pages'}
        value={normalizePreviewSize(size)}
        options={PREVIEW_SIZE_OPTIONS}
        onChange={onSizeChange}
      />
      {showQuality ? (
        <OptionButtons
          label="Qualité"
          value={normalizePreviewQuality(quality)}
          options={PREVIEW_QUALITY_OPTIONS}
          onChange={onQualityChange}
        />
      ) : null}
    </div>
  );
}

export default memo(PreviewDisplayControls);
