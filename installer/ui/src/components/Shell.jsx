// Sawahiro installer — shared shell + window chrome.
// Every installer screen drops its content inside <InstallerShell ...>.

import React from 'react';
import { Monogram } from './Monogram.jsx';
import { IllustrationPanel } from './IllustrationPanel.jsx';
import { installerAPI } from '../lib/ipc.js';

// ───────────────────────────────────────────────────────── Window chrome ──
export function WindowTitleBar({ title = 'Sawa Manga Library Setup' }) {
  return (
    <div className="nsis-titlebar">
      <Monogram size={18} />
      <div className="nsis-title">
        <span className="accent">Sawa</span> · Setup
        <span
          style={{
            color: 'var(--text-muted)',
            fontWeight: 400,
            marginLeft: 6,
          }}
        >
          — Midnight Ember
        </span>
      </div>
      <div className="win-controls">
        <div
          className="win-btn"
          title="Minimize"
          onClick={() => installerAPI?.minimize?.()}
        >
          ─
        </div>
        <div className="win-btn" title="Maximize" style={{ opacity: 0.5 }}>
          ▢
        </div>
        <div
          className="win-btn close"
          title="Close"
          onClick={() => installerAPI?.quit?.()}
        >
          ✕
        </div>
      </div>
    </div>
  );
}

export function StepBar({ step, total = 8, labels }) {
  return (
    <div className="steps">
      {labels.map((l, i) => (
        <span
          key={l}
          className={
            'step ' + (i === step ? 'active' : i < step ? 'done' : '')
          }
        >
          {String(i + 1).padStart(2, '0')} {l}
        </span>
      ))}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub }) {
  return (
    <div className="nsis-pageheader">
      <Monogram size={48} />
      <div className="ph-text">
        {eyebrow && (
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {eyebrow}
          </div>
        )}
        <div className="ph-title">{title}</div>
        <div className="ph-sub">{sub}</div>
      </div>
    </div>
  );
}

export function Footer({
  meta = 'Nullsoft Install System v3.09',
  left,
  children,
}) {
  return (
    <div className="nsis-footer">
      <div className="footer-meta">{meta}</div>
      {left}
      <div className="footer-actions">{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── Shell ──
/*
  <InstallerShell
    variant="page" | "welcome" | "finish"
    steps={['Welcome','License',...]}    optional — renders step bar
    current={2}
    header={{eyebrow,title,sub}}         page header (skipped on welcome/finish)
    footer={<> buttons </>}              rendered on the right of footer
    footerLeft={<> optional left slot </>}
    modal={<Modal ... />}                 overlays body when provided
  >
    page contents
  </InstallerShell>
*/
export function InstallerShell({
  variant = 'page',
  steps,
  current = 0,
  header,
  footer,
  footerLeft,
  modal,
  children,
  dense = false,
}) {
  const isWelcome = variant === 'welcome' || variant === 'finish';
  return (
    <div className="nsis-window">
      <WindowTitleBar />
      {!isWelcome && steps && (
        <StepBar step={current} total={steps.length} labels={steps} />
      )}
      {!isWelcome && header && <PageHeader {...header} />}

      {isWelcome ? (
        <div className="nsis-split">
          <IllustrationPanel variant={variant} />
          <div className={'nsis-body ' + (dense ? 'dense' : '')}>{children}</div>
        </div>
      ) : (
        <div className={'nsis-body ' + (dense ? 'dense' : '')}>{children}</div>
      )}

      <Footer left={footerLeft}>{footer}</Footer>

      {modal && <div className="modal-host">{modal}</div>}
    </div>
  );
}

export { Monogram, IllustrationPanel };
export {
  Check,
  Notice,
  Progress,
  Modal,
  ConsoleLog,
} from './Controls.jsx';
