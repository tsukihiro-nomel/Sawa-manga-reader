import { memo, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, Unlock } from 'lucide-react';
import KavitaLibraryView from './KavitaLibraryView.jsx';

function PinForm({ configured, onSetupPin, onUnlock }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (pin.length < 4) {
      setError('Le code doit contenir au moins 4 caracteres.');
      return;
    }
    if (!configured && pin !== confirmPin) {
      setError('Les deux codes ne correspondent pas.');
      return;
    }
    setPending(true);
    try {
      if (configured) await onUnlock?.(pin);
      else await onSetupPin?.(pin);
      setPin('');
      setConfirmPin('');
    } catch (actionError) {
      setError(actionError?.message || 'Impossible d ouvrir le coffre.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="kv-vault-auth" onSubmit={submit}>
      <div className="kv-vault-auth-icon">{configured ? <Lock size={28} /> : <ShieldCheck size={28} />}</div>
      <div>
        <h1>{configured ? 'Coffre verrouille' : 'Configurer le coffre'}</h1>
        <p>{configured ? 'Saisis ton code pour afficher le contenu prive.' : 'Cree un code local pour proteger tes mangas prives.'}</p>
      </div>
      <label>
        <span>Code PIN</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete={configured ? 'current-password' : 'new-password'}
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          autoFocus
        />
      </label>
      {!configured ? (
        <label>
          <span>Confirmer le code</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
          />
        </label>
      ) : null}
      {error ? <p className="kv-vault-error" role="alert">{error}</p> : null}
      <button type="submit" className="kv-primary-action" disabled={pending}>
        {configured ? <Unlock size={16} /> : <ShieldCheck size={16} />}
        {pending ? 'Verification...' : configured ? 'Deverrouiller' : 'Configurer'}
      </button>
    </form>
  );
}

function KavitaVaultView({
  vault,
  mangas = [],
  categories = [],
  activeCategoryId = null,
  selectionMode = false,
  selectedIds = new Set(),
  onSetupPin,
  onUnlock,
  onLock,
  onSelectCategory,
  onToggleSelectionMode,
  onToggleSelect,
  onOpenManga,
  onOpenMangaInNewTab,
  onToggleFavorite,
  onContextMenu,
  onToggleBlur,
  onToggleStealth
}) {
  if (!vault?.configured) {
    return (
      <section className="kv-vault-view is-locked">
        <PinForm configured={false} onSetupPin={onSetupPin} />
      </section>
    );
  }

  if (vault.locked) {
    return (
      <section className="kv-vault-view is-locked">
        <PinForm configured onUnlock={onUnlock} />
      </section>
    );
  }

  return (
    <section className={`kv-vault-view ${vault.stealthMode ? 'is-stealth' : ''}`}>
      <header className="kv-vault-toolbar">
        <div>
          <h1>{vault.stealthMode ? 'Espace prive' : 'Coffre'}</h1>
          <p>{mangas.length} manga(s)</p>
        </div>
        <div className="kv-vault-actions">
          <button type="button" onClick={onToggleSelectionMode}>{selectionMode ? 'Terminer' : 'Selectionner'}</button>
          <button type="button" onClick={onToggleBlur} title={vault.blurCovers ? 'Afficher les couvertures' : 'Flouter les couvertures'}>
            {vault.blurCovers ? <Eye size={16} /> : <EyeOff size={16} />}
            {vault.blurCovers ? 'Afficher' : 'Flouter'}
          </button>
          <button type="button" onClick={onToggleStealth}>
            <ShieldCheck size={16} />
            {vault.stealthMode ? 'Mode normal' : 'Mode stealth'}
          </button>
          <button type="button" className="is-danger" onClick={onLock}><Lock size={16} />Verrouiller</button>
        </div>
      </header>
      <nav className="kv-vault-categories" aria-label="Categories privees">
        <button type="button" className={!activeCategoryId ? 'is-active' : ''} onClick={() => onSelectCategory?.(null)}>Tous</button>
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            className={activeCategoryId === category.id ? 'is-active' : ''}
            onClick={() => onSelectCategory?.(category.id)}
          >
            {category.name}
          </button>
        ))}
      </nav>
      <div className="kv-vault-library">
        <KavitaLibraryView
          mangas={mangas}
          title=""
          subtitle=""
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onOpenManga={onOpenManga}
          onOpenMangaInNewTab={onOpenMangaInNewTab}
          onToggleFavorite={onToggleFavorite}
          onToggleSelect={onToggleSelect}
          onContextMenu={onContextMenu}
          privateBlur={Boolean(vault.blurCovers)}
        />
      </div>
    </section>
  );
}

export default memo(KavitaVaultView);
