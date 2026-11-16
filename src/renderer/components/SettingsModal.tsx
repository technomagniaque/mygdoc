import React, { useState } from 'react';
import { AppStateSnapshot } from '../../shared/types';

interface SettingsModalProps {
  state: AppStateSnapshot;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ state, onClose }) => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [svcName, setSvcName] = useState('');
  const [svcUrl, setSvcUrl] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSaveCreds = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setFeedback('Veuillez renseigner Client ID et Client Secret.');
      return;
    }
    await window.gdocsApi.saveOAuthCredentials({ clientId, clientSecret });
    setFeedback('Identifiants OAuth2 enregistrés.');
  };

  const handleConnect = async () => {
    setFeedback('Ouverture du navigateur pour connexion Google Drive…');
    const res = await window.gdocsApi.connectOAuth();
    if (res.ok) {
      setFeedback('Google Drive connecté avec succès.');
    } else {
      setFeedback(res.error || 'Échec de connexion OAuth2.');
    }
  };

  const handleAddService = async () => {
    if (!svcName.trim() || !svcUrl.trim()) return;
    await window.gdocsApi.addCustomService({
      name: svcName.trim(),
      url: svcUrl.trim().startsWith('http') ? svcUrl.trim() : `https://${svcUrl.trim()}`,
      iconText: '🌐',
    });
    setSvcName('');
    setSvcUrl('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Paramètres Google Docs Desktop</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-field">
          <label>
            Statut OAuth2 Google Drive :{' '}
            <strong>
              {state.syncStatus.oauthConnected ? 'Connecté' : 'Non connecté'}
            </strong>
          </label>
          {!state.syncStatus.oauthConnected && (
            <>
              <input
                type="text"
                placeholder="Google OAuth2 Client ID (Desktop App)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                type="password"
                placeholder="Google OAuth2 Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </>
          )}
          <div className="btn-row" style={{ justifyContent: 'flex-start', marginTop: '4px' }}>
            {!state.syncStatus.oauthConnected ? (
              <>
                <button className="btn" onClick={() => void handleSaveCreds()}>
                  Enregistrer identifiants
                </button>
                <button
                  className="btn primary"
                  disabled={!state.hasOAuthCredentials && (!clientId || !clientSecret)}
                  onClick={() => void handleConnect()}
                >
                  Connecter Google Drive
                </button>
              </>
            ) : (
              <button
                className="btn danger"
                onClick={() => void window.gdocsApi.disconnectOAuth()}
              >
                Déconnecter Google Drive
              </button>
            )}
          </div>
        </div>

        <div className="form-field">
          <label>Extension Google Docs Offline</label>
          <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn"
              onClick={async () => {
                const res = await window.gdocsApi.checkExtensionUpdate();
                setFeedback(
                  res.updated
                    ? `Extension mise à jour (v${res.version}).`
                    : `Extension à jour (${res.version || 'OK'}).`
                );
              }}
            >
              Vérifier mise à jour extension
            </button>
          </div>
        </div>

        <div className="form-field">
          <label>
            Mode User-Agent connexion Google :{' '}
            <strong>
              {state.loginUaMode === 'firefox-login'
                ? 'Firefox Desktop (secours connexion)'
                : 'Chrome cohérent (+ Client Hints)'}
            </strong>
          </label>
          <div className="btn-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button
              className={`btn ${state.loginUaMode === 'chrome-coherent' ? 'primary' : ''}`}
              onClick={() => void window.gdocsApi.setLoginUaMode('chrome-coherent', false)}
            >
              Chrome cohérent
            </button>
            <button
              className={`btn ${state.loginUaMode === 'firefox-login' ? 'primary' : ''}`}
              onClick={() => void window.gdocsApi.setLoginUaMode('firefox-login', false)}
            >
              Firefox Desktop (secours)
            </button>
            <button
              className="btn"
              onClick={() => void window.gdocsApi.setLoginUaMode(state.loginUaMode, true)}
            >
              Réessayer la connexion Google Drive
            </button>
          </div>
          <div className="status-sub">
            Si accounts.google.com bloque la connexion en Chrome cohérent, utilisez « Firefox Desktop (secours) » puis réessayez.
          </div>
        </div>

        <div className="form-field">
          <label>
            Contrôle à distance Antigravity (Bridge local) :{' '}
            <strong>
              {!state.remoteBridge.enabled
                ? 'Désactivé'
                : state.remoteBridge.paused
                ? 'En pause'
                : state.remoteBridge.listening && state.remoteBridge.port
                ? `Actif sur 127.0.0.1:${state.remoteBridge.port}`
                : state.remoteBridge.error || 'Arrêté'}
            </strong>
          </label>
          <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
            <button
              className="btn"
              onClick={() =>
                void window.gdocsApi.setRemoteBridgeEnabled(!state.remoteBridge.enabled)
              }
            >
              {state.remoteBridge.enabled ? 'Désactiver le Bridge' : 'Activer le Bridge'}
            </button>
            {state.remoteBridge.enabled && (
              <button
                className="btn primary"
                onClick={() =>
                  void window.gdocsApi.setRemoteBridgePaused(!state.remoteBridge.paused)
                }
              >
                {state.remoteBridge.paused ? 'Reprendre le contrôle' : 'Mettre en pause'}
              </button>
            )}
          </div>
          {state.remoteBridge.lastAction && (
            <div className="status-sub">
              Dernière action distante : {state.remoteBridge.lastAction}
            </div>
          )}
        </div>

        <div className="form-field">
          <label>Ajouter un service web personnalisé (façon Ferdium)</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Nom (ex: Claude, Notion)"
              value={svcName}
              onChange={(e) => setSvcName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              placeholder="URL (https://...)"
              value={svcUrl}
              onChange={(e) => setSvcUrl(e.target.value)}
              style={{ flex: 2 }}
            />
            <button className="btn primary" onClick={() => void handleAddService()}>
              +
            </button>
          </div>
        </div>

        {feedback && <div className="status-text">{feedback}</div>}

        <div className="btn-row">
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
