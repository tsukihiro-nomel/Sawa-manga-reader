import React, { useState } from 'react';
import { InstallerShell, Check } from '../components/Shell.jsx';
import { STEP_LABELS } from '../lib/state.js';

const ITEMS = [
  {
    k: 'core',
    r: true,
    size: '612 MB',
    name: 'Sawa Core - lecteur & bibliotheque',
    desc: 'Electron, React, better-sqlite3 et pdfjs-dist',
  },
  {
    k: 'suwa',
    r: true,
    size: '124 MB',
    name: 'Runtime Sources web',
    desc: "Inclus avec Sawa pour l'import depuis extensions communautaires",
  },
  {
    k: 'jre',
    r: true,
    size: '184 MB',
    name: 'Java Runtime 21 bundled',
    desc: 'Inclus pour garantir le runtime Sources web',
  },
  {
    k: 'themes',
    r: true,
    size: '4 MB',
    name: 'Themes additionnels',
    desc: 'Inclus dans le bundle applicatif',
  },
  {
    k: 'assoc',
    size: '-',
    name: 'Associations fichiers et protocole',
    desc: '.cbz, .cbr, .cb7, .pdf manga et sawa://',
  },
  {
    k: 'ctx',
    size: '-',
    name: 'Menu contextuel Explorateur',
    desc: 'Ajouter une entree "Ouvrir avec Sawa"',
  },
];

const PROFILES = [
  { core: 1, suwa: 1, jre: 1, themes: 1, assoc: 1, ctx: 1 },
  { core: 1, suwa: 1, jre: 1, themes: 1, assoc: 1, ctx: 0 },
  { core: 1, suwa: 1, jre: 1, themes: 1, assoc: 0, ctx: 0 },
  null,
];

const PROFILE_NAMES = ['Complete', 'Standard', 'Minimale', 'Personnalisee'];

function normalizeComps(comps) {
  return Object.fromEntries(ITEMS.map((item) => [item.k, comps[item.k] ? 1 : 0]));
}

function compsEqualProfile(comps, profile) {
  if (!profile) return false;
  return JSON.stringify(profile) === JSON.stringify(normalizeComps(comps));
}

export function ComponentsPage({ state, dispatch }) {
  const [comps, setComps] = useState(state.components);
  const toggle = (k) => setComps((c) => ({ ...c, [k]: !c[k] }));

  const total = ITEMS.reduce((acc, it) => {
    if (!comps[it.k]) return acc;
    const n = parseFloat(it.size);
    if (Number.isNaN(n)) return acc;
    return acc + n * (it.size.endsWith('GB') ? 1024 : 1);
  }, 0);

  return (
    <InstallerShell
      steps={STEP_LABELS}
      current={3}
      header={{
        eyebrow: 'Etape 04',
        title: 'Choisir les integrations',
        sub: 'Seules les options visibles ci-dessous pilotent le backend NSIS',
      }}
      footer={
        <>
          <button className="btn" onClick={() => dispatch({ goto: 'prereq' })}>
            Precedent
          </button>
          <button className="btn" onClick={() => dispatch({ abort: true })}>
            Annuler
          </button>
          <button
            className="btn primary"
            onClick={() =>
              dispatch({ set: { components: comps }, goto: 'location' })
            }
          >
            Suivant
          </button>
        </>
      }
      footerLeft={
        <div
          style={{
            marginLeft: 14,
            fontSize: 10.5,
            color: 'var(--text-muted)',
            fontFamily: 'var(--ff-mono)',
            letterSpacing: '.04em',
          }}
        >
          REQUIS&nbsp;
          <span style={{ color: 'var(--gold-soft)' }}>{total.toFixed(0)} MB</span>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Profil d'installation
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {PROFILE_NAMES.map((p, i) => {
              const profile = PROFILES[i];
              const active = profile
                ? compsEqualProfile(comps, profile)
                : !PROFILES.slice(0, 3).some((pp) => compsEqualProfile(comps, pp));
              return (
                <button
                  key={p}
                  className="btn"
                  onClick={() => {
                    if (profile) {
                      setComps(
                        Object.fromEntries(
                          Object.entries(profile).map(([k, v]) => [k, !!v])
                        )
                      );
                    }
                  }}
                  disabled={!profile}
                  style={{
                    minWidth: 0,
                    padding: '0 12px',
                    height: 26,
                    fontSize: 11,
                    background: active ? 'rgba(200,100,48,.14)' : undefined,
                    borderColor: active ? 'var(--border-ember)' : undefined,
                    color: active ? 'var(--gold-soft)' : undefined,
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sep" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 2 }}>
        {ITEMS.map((it) => (
          <React.Fragment key={it.k}>
            <Check
              on={!!comps[it.k]}
              disabled={it.r}
              onClick={() => !it.r && toggle(it.k)}
              title={
                <>
                  {it.name}
                  {it.r && (
                    <span
                      className="mono"
                      style={{
                        fontSize: 9,
                        color: 'var(--gold-soft)',
                        marginLeft: 8,
                        letterSpacing: '.1em',
                      }}
                    >
                      REQUIS
                    </span>
                  )}
                </>
              }
              desc={it.desc}
            />
            <div
              style={{
                alignSelf: 'center',
                fontFamily: 'var(--ff-mono)',
                fontSize: 10.5,
                color: 'var(--text-muted)',
                letterSpacing: '.06em',
                padding: '0 8px',
              }}
            >
              {it.size}
            </div>
          </React.Fragment>
        ))}
      </div>
    </InstallerShell>
  );
}

export default ComponentsPage;
