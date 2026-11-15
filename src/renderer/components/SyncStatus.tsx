import React from 'react';
import { SyncStatusState } from '../../shared/types';

interface SyncStatusProps {
  status: SyncStatusState;
  collapsed: boolean;
  onOpenSettings: () => void;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({
  status,
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

      {status.lastError && (
        <div className="status-sub" style={{ color: 'var(--danger)' }}>
          {status.lastError}
        </div>
      )}
    </div>
  );
};
