import { memo, useMemo, useState } from 'react';
import MangaCard from './MangaCard.jsx';
import { ArchiveIcon, EyeIcon, EyeOffIcon, LockIcon, SettingsIcon } from './Icons.jsx';

function getSecurityLabel(vault) {
  if (vault?.securityMode === 'system') return 'Protection systeme Windows';
  if (vault?.securityMode === 'basic') return 'PIN local';
  if (vault?.systemProtectionAvailable) return 'Protection systeme disponible';
  return 'PIN local';
}

function getSecurityCopy(vault) {
  if (vault?.securityMode === 'system') {
    return 'Le code du coffre est protege par le chiffrement local de Windows en plus du PIN.';
  }
  if (vault?.systemProtectionAvailable) {
    return 'La protection systeme locale est disponible. Reconfigurer le coffre appliquera ce niveau de protection.';
  }
  return 'Le coffre reste verrouille par PIN local et masque son contenu hors de la vue dediee.';
}

function VaultMetaPill({ label, value }) {
  return (
    <div className="vault-meta-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VaultSetupCard({ configured, onSubmit, title, description, submitLabel, vault }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');

  const requiresConfirm = !configured;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pin.trim().length < 4) {
      setError('Le code PIN doit contenir au moins 4 caracteres.');
      return;
    }
    if (requiresConfirm && pin !== confirmPin) {
      setError('Les codes PIN ne correspondent pas.');
      return;
    }
    setError('');
    try {
      await onSubmit(pin);
      setPin('');
      setConfirmPin('');
    } catch (submitError) {
      setError(submitError?.message || 'Operation impossible.');
    }
  };

  return (
    <div className="vault-locked-card">
      <div className="vault-locked-copy">
        <span className="vault-kicker">Coffre prive</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="vault-meta-row">
          <VaultMetaPill label="Protection" value={getSecurityLabel(vault)} />
          <VaultMetaPill label="Fermeture" value="Verrouillage auto" />
        </div>
        <p className="vault-security-copy">{getSecurityCopy(vault)}</p>
      </div>
      <form className="vault-form" onSubmit={handleSubmit}>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="Code PIN"
          autoFocus
        />
        {requiresConfirm ? (
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
            placeholder="Confirmer le code PIN"
          />
        ) : null}
        {error ? <span className="vault-form-error">{error}</span> : null}
        <button type="submit" className="primary-button">{submitLabel}</button>
      </form>
    </div>
  );
}

function VaultView({
  vault,
  mangas,
  categories = [],
  activeCategoryId = null,
  selectionMode,
  selectedIds,
  onToggleSelectionMode,
  onSelectCategory,
  onToggleSelect,
  onOpenManga,
  onToggleFavorite,
  onContextMenu,
  onSetupPin,
  onUnlock,
  onLock,
  onToggleBlur,
  onToggleStealth
}) {
  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) || null,
    [activeCategoryId, categories]
  );

  if (!vault?.configured) {
    return (
      <section className="vault-view">
        <VaultSetupCard
          configured={false}
          vault={vault}
          title="Configure un coffre discret pour les contenus sensibles."
          description="Les titres prives et les categories envoyees au coffre disparaissent de la navigation normale tant que tu restes hors du coffre."
          submitLabel="Activer le coffre"
          onSubmit={onSetupPin}
        />
      </section>
    );
  }

  if (vault.locked) {
    return (
      <section className="vault-view">
        <VaultSetupCard
          configured
          vault={vault}
          title="Le coffre est verrouille."
          description="Entre ton code pour retrouver les mangas prives. A la fermeture de l application, le coffre se reverrouille automatiquement."
          submitLabel="Deverrouiller"
          onSubmit={onUnlock}
        />
      </section>
    );
  }

  const totalProtected = Number(vault?.privateCount || mangas.length || 0);
  const categoryCount = Number(vault?.privateCategoryCount || categories.length || 0);
  const visibleCount = mangas.length;
  const title = activeCategory
    ? `${visibleCount} titre${visibleCount > 1 ? 's' : ''} dans ${activeCategory.name}`
    : `${totalProtected} titre${totalProtected > 1 ? 's' : ''} proteges`;

  return (
    <section className="vault-view">
      <div className="vault-hero">
        <div>
          <span className="vault-kicker">Coffre prive</span>
          <h1>{title}</h1>
          <p>
            Les categories envoyees ici disparaissent entierement de la bibliotheque normale et restent accessibles
            uniquement depuis cette vue.
          </p>
        </div>
        <div className="vault-hero-actions">
          <button type="button" className="ghost-button" onClick={onToggleSelectionMode}>
            <SettingsIcon size={14} /> {selectionMode ? 'Quitter la selection' : 'Selection multiple'}
          </button>
          <button type="button" className="ghost-button" onClick={onToggleStealth}>
            <LockIcon size={14} /> {vault.stealthMode ? 'Stealth actif' : 'Activer stealth'}
          </button>
          <button type="button" className="ghost-button" onClick={onToggleBlur}>
            {vault.blurCovers ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            {vault.blurCovers ? 'Retirer le flou' : 'Flouter les covers'}
          </button>
          <button type="button" className="primary-button" onClick={onLock}>
            <LockIcon size={14} /> Reverrouiller
          </button>
        </div>
      </div>

      <div className="vault-meta-row">
        <VaultMetaPill label="Protection" value={getSecurityLabel(vault)} />
        <VaultMetaPill label="Fermeture" value="Verrouillage auto" />
        <VaultMetaPill label="Categories" value={`${categoryCount}`} />
        <VaultMetaPill label="Vue" value={activeCategory ? activeCategory.name : 'Tout le coffre'} />
        <VaultMetaPill label="Stealth" value={vault.stealthMode ? 'Masquage strict' : 'Normal'} />
      </div>

      <p className="vault-security-copy">{getSecurityCopy(vault)}</p>

      {categories.length > 0 ? (
        <div className="vault-category-strip">
          <button
            type="button"
            className={`vault-category-chip ${!activeCategoryId ? 'active' : ''}`}
            onClick={() => onSelectCategory?.(null)}
          >
            <span>Tous</span>
            <span className="vault-category-chip-count">{totalProtected}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`vault-category-chip ${activeCategoryId === category.id ? 'active' : ''}`}
              onClick={() => onSelectCategory?.(category.id)}
              onContextMenu={(event) => onContextMenu?.(event, { type: 'category', category, scope: 'vault' })}
              title={`${category.name} - clic droit pour actions rapides`}
            >
              <span>{category.name}</span>
              <span className="vault-category-chip-count">{category.mangaCount ?? 0}</span>
            </button>
          ))}
        </div>
      ) : null}

      {mangas.length === 0 ? (
        <div className="vault-empty-card">
          <ArchiveIcon size={18} />
          <strong>{activeCategory ? 'Cette categorie privee est vide.' : 'Le coffre est vide.'}</strong>
          <span>
            {activeCategory
              ? 'Retire le filtre ou envoie de nouveaux mangas dans cette categorie depuis le menu contextuel.'
              : 'Envoie des mangas ou une categorie complete ici depuis le menu contextuel ou les actions en masse.'}
          </span>
        </div>
      ) : (
        <div className="vault-grid">
          {mangas.map((manga) => (
            <MangaCard
              key={manga.id}
              manga={manga}
              onOpen={onOpenManga}
              onToggleFavorite={onToggleFavorite}
              onContextMenu={onContextMenu}
              selected={selectedIds.has(manga.id)}
              selectionMode={selectionMode}
              onToggleSelect={onToggleSelect}
              privateBlur={vault.blurCovers}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(VaultView);
