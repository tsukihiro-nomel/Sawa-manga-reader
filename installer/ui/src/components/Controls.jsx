// Small primitives shared across pages: Check (checkbox/radio), Notice
// (info/warn/danger/ok callouts), Progress bar, Modal, ConsoleLog.

import React, { useEffect, useRef } from 'react';

export function Check({ on, onClick, title, desc, radio, disabled }) {
  return (
    <div
      className={
        'check ' +
        (radio ? 'radio ' : '') +
        (on ? 'on ' : '') +
        (disabled ? 'dis' : '')
      }
      onClick={disabled ? undefined : onClick}
      role={radio ? 'radio' : 'checkbox'}
      aria-checked={!!on}
    >
      <div className="box" />
      <div className="txt">
        <div className="t">{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
    </div>
  );
}

export function Notice({ kind = 'info', icon, children, title }) {
  const defaults = { info: 'i', warn: '!', danger: '×', ok: '✓' };
  return (
    <div className={'notice ' + kind}>
      <span className="icon">{icon || defaults[kind]}</span>
      <div>
        {title && (
          <div
            style={{
              fontWeight: 600,
              marginBottom: 2,
              color: 'var(--silver-cool)',
            }}
          >
            {title}
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Progress({ value, done }) {
  return (
    <div className={'progress ' + (done ? 'done' : '')}>
      <div
        className="bar"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Modal({ kind = 'warn', title, sub, children, footer }) {
  const colors = {
    warn: { bg: 'rgba(244,208,111,.12)', fg: 'var(--gold-ui)' },
    danger: { bg: 'rgba(192,72,64,.14)', fg: '#e06b5e' },
    info: { bg: 'rgba(74,139,149,.14)', fg: 'var(--turquoise)' },
    ok: { bg: 'rgba(168,230,207,.14)', fg: 'var(--mint)' },
  }[kind];
  const glyph = { warn: '!', danger: '×', info: 'i', ok: '✓' }[kind];
  return (
    <div className="modal">
      <div className="mh">
        <div
          className="dot"
          style={{
            background: colors.bg,
            color: colors.fg,
            border: `1px solid ${colors.fg}`,
          }}
        >
          {glyph}
        </div>
        <div style={{ flex: 1 }}>
          <h4>{title}</h4>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <div className="mb">{children}</div>
      <div className="mf">{footer}</div>
    </div>
  );
}

export function ConsoleLog({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div className="console" ref={ref}>
      {lines.map((l, i) => (
        <div className="row" key={i}>
          <span className="t">{l.t}</span>
          <span className={'m ' + (l.c || '')}>{l.m}</span>
        </div>
      ))}
    </div>
  );
}
