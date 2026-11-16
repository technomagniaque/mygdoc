import React from 'react';
import { GoogleLoginUaMode, RemoteBridgeStatus, SyncStatusState } from '../../shared/types';

interface SyncStatusProps {
  status: SyncStatusState;
  remoteBridge: RemoteBridgeStatus;
  loginUaMode: GoogleLoginUaMode;
  authRejected: boolean;
  collapsed: boolean;
  onOpenSettings: () => void;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({
  status,
  remoteBridge,
  loginUaMode,
  authRejected,
  collapsed,
  onOpenSettings,
}) => {
  const formattedTime = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  if (collapsed) {
    return (
      <div className="panel-box" style={{ alignItems: 'center' }}>
        <span
          className={`status-dot ${status.online ? 'online' : 'offline'}`}
          title={status.online ? 'En ligne' : 'Mode Hors-Ligne actif'}
        />
        <button className="icon-btn" title="Paramètres & OAuth2" onClick={onOpenSettings}>
          ⚙️
        </button>
      </div>
    );
  }

  return (
    <div className="panel-box">
      <div className="panel-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span className={`status-dot ${status.online ? 'online' : 'offline'}`} />
          <span className="status-text">
            {status.online
              ? status.syncing
                ? 'Synchronisation…'
                : formattedTime
                ? `En ligne • Sync ${formattedTime}`
                : 'En ligne'
              : 'Mode Hors-Ligne actif'}
          </span>
        </div>
        <button className="icon-btn" title="Paramètres & OAuth2" onClick={onOpenSettings}>
          ⚙️
        </button>
      </div>

      <div className="status-sub">
        Extension Offline :{' '}
        {status.extensionLoaded
          ? `Active (${status.extensionVersion || 'OK'})`
          : 'Non chargée'}
      </div>

      <div className="panel-row" style={{ marginTop: '2px' }}>
        <span
          className="status-sub"
          title={
            remoteBridge.lastAction
              ? `Dernière action : ${remoteBridge.lastAction}`
              : 'Pont local Antigravity (127.0.0.1)'
          }
        >
          Bridge :{' '}
          {!remoteBridge.enabled
            ? 'Désactivé'
            : remoteBridge.paused
            ? 'En pause'
            : remoteBridge.listening && remoteBridge.port
            ? `Actif (:${remoteBridge.port})`
            : remoteBridge.error || 'Inactif'}
        </span>
        {remoteBridge.enabled && (
          <button
            className="toggle-pill"
            title={remoteBridge.paused ? 'Reprendre le contrôle à distance' : 'Mettre en pause le contrôle à distance'}
            onClick={() => void window.gdocsApi.setRemoteBridgePaused(!remoteBridge.paused)}
          >
            {remoteBridge.paused ? 'Reprendre' : 'Pause'}
          </button>
        )}
      </div>

      {status.activeMapping && (
        <div className="panel-row" style={{ marginTop: '2px' }}>
          <span
            className="status-sub"
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={status.activeMapping.localPath}
          >
            Dolphin : {status.activeMapping.localPath.split('/').pop()}
          </span>
          <button
            className="toggle-pill"
            title="Exporter maintenant vers le fichier local (Ctrl+S)"
            onClick={() => void window.gdocsApi.forceExportActive()}
          >
            Exporter
          </button>
        </div>
      )}

      {authRejected && (
        <div
          style={{
            marginTop: '4px',
            padding: '6px 7px',
            borderRadius: '6px',
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}
        >
          <div className="status-sub" style={{ color: '#fca5a5', lineHeight: 1.3 }}>
            Connexion Google bloquée par accounts.google.com.
          </div>
          <button
            className="toggle-pill"
            style={{ alignSelf: 'flex-start' }}
            title="Bascule l'agent de connexion vers Firefox Desktop sans Client Hints et recharge Google Drive"
            onClick={() =>
              void window.gdocsApi.setLoginUaMode(
                loginUaMode === 'firefox-login' ? 'chrome-coherent' : 'firefox-login',
                true
              )
            }
          >
            {loginUaMode === 'firefox-login'
              ? 'Réessayer en mode Chrome'
              : 'Essayer connexion mode Firefox'}
          </button>
        </div>
      )}

      {status.lastError && (
        <div className="status-sub" style={{ color: 'var(--danger)' }}>
          {status.lastError}
        </div>
      )}
    </div>
  );
};
