// Sawahiro installer monogram — original serif "S" with cat-ear silhouette +
// the two signature hair-clips (gold + cyan) sitting as accent dots. Built
// entirely from basic shapes + type, per the design system rules.

import React from 'react';

export function Monogram({ size = 48, showSub = false }) {
  return (
    <div
      className="ph-mark"
      style={{
        width: size,
        height: size,
        background:
          'radial-gradient(circle at 28% 28%, rgba(210,166,101,.28), transparent 62%),' +
          'linear-gradient(135deg, #0E1424, #1a2340)',
      }}
    >
      {/* cat ears (two simple triangles) */}
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        style={{ position: 'absolute', inset: 0 }}
      >
        <polygon points="10,14 14,4 19,14" fill="#3A4A6A" opacity=".9" />
        <polygon points="29,14 34,4 38,14" fill="#3A4A6A" opacity=".9" />
        <polygon points="12,12 14.5,7 17,12" fill="#DCC4A3" opacity=".35" />
        <polygon points="31,12 34,7 36,12" fill="#DCC4A3" opacity=".35" />
      </svg>
      {/* serif S */}
      <div className="monogram" style={{ position: 'relative', zIndex: 1 }}>
        S
        {showSub && <span className="sub">SAWA</span>}
      </div>
      {/* two hair-clip accent dots */}
      <span
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 4,
          height: 4,
          borderRadius: 2,
          background: 'var(--gold-ui)',
          boxShadow: '0 0 6px var(--gold-soft)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 13,
          right: 10,
          width: 3,
          height: 3,
          borderRadius: 2,
          background: 'var(--turquoise)',
          boxShadow: '0 0 5px var(--turquoise)',
        }}
      />
    </div>
  );
}

export default Monogram;
