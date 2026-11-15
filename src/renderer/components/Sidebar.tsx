import React from 'react';
import { AppStateSnapshot, ServiceKind, TabItem } from '../../shared/types';
import { DarkModeMenu } from './DarkModeMenu';
import { SyncStatus } from './SyncStatus';

interface SidebarProps {
  state: AppStateSnapshot;
  onOpenSettings: () => void;
}

const SERVICE_ICONS: Record<ServiceKind, string> = {
  drive: '📁',
  docs: '📄',
  sheets: '📊',
  slides: '📽️',
  custom: '🌐',
};

export const Sidebar: React.FC<SidebarProps> = ({ state, onOpenSettings }) => {
  const { tabs, activeTabId, sidebarCollapsed, customServices, syncStatus } = state;
  const activeTab: TabItem | undefined = tabs.find((t) => t.id === activeTabId);

  const openQuickService = (url: string, title: string, kind: ServiceKind) => {
    void window.gdocsApi.createTab({ url, title, kind });
  };

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!sidebarCollapsed && <span className="sidebar-brand">Google Docs Desktop</span>}
        <button
          className="icon-btn"
          title={sidebarCollapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
          onClick={() => void window.gdocsApi.toggleSidebar()}
        >
          {sidebarCollapsed ? '»' : '«'}
        </button>
      </div>

      {!sidebarCollapsed && (
        <div className="nav-controls">
          <button
            className="icon-btn"
            disabled={!activeTab?.canGoBack}
            title="Précédent"
            onClick={() => void window.gdocsApi.goBack()}
          >
            ←
          </button>
          <button
            className="icon-btn"
            disabled={!activeTab?.canGoForward}
            title="Suivant"
            onClick={() => void window.gdocsApi.goForward()}
          >
            →
          </button>
          <button
            className="icon-btn"
            title="Recharger"
            onClick={() => void window.gdocsApi.reloadTab()}
          >
            ↻
          </button>
          <button
            className="icon-btn"
            style={{ marginLeft: 'auto' }}
            title="Importer un document local (Dolphin)"
            onClick={() => void window.gdocsApi.openImportDialog()}
          >
            📥
          </button>
        </div>
      )}

      <div className="quick-actions">
        <button
          className="action-btn primary"
          title="Nouveau Google Doc (Ctrl+T)"
          onClick={() =>
            openQuickService('https://docs.google.com/document/create', 'Nouveau Google Doc', 'docs')
          }
        >
          <span>📄</span>
          {!sidebarCollapsed && <span>Nouveau Doc</span>}
        </button>
        <button
          className="action-btn"
          title="Nouveau Google Sheet"
          onClick={() =>
            openQuickService('https://sheets.google.com/create', 'Nouveau Sheet', 'sheets')
          }
        >
          <span>📊</span>
          {!sidebarCollapsed && <span>Nouveau Sheet</span>}
        </button>
        <button
          className="action-btn"
          title="Nouveau Google Slides"
          onClick={() =>
            openQuickService('https://slides.google.com/create', 'Nouveau Slides', 'slides')
          }
        >
          <span>📽️</span>
          {!sidebarCollapsed && <span>Nouveau Slides</span>}
        </button>
        {customServices.map((svc) => (
          <button
            key={svc.id}
            className="action-btn"
            title={svc.name}
            onClick={() => openQuickService(svc.url, svc.name, 'custom')}
          >
            <span>{svc.iconText || '🌐'}</span>
            {!sidebarCollapsed && <span>{svc.name}</span>}
          </button>
        ))}
      </div>

      {!sidebarCollapsed && <div className="section-title">Documents & Espaces</div>}

      <div className="tabs-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab-item ${isActive ? 'active' : ''}`}
              title={tab.title}
              onClick={() => void window.gdocsApi.activateTab(tab.id)}
            >
              <div className="tab-label">
                <span>{SERVICE_ICONS[tab.kind]}</span>
                {!sidebarCollapsed && <span className="tab-title">{tab.title}</span>}
              </div>
              {!sidebarCollapsed && !tab.pinned && (
                <button
                  className="tab-close"
                  title="Fermer (Ctrl+W)"
                  onClick={(e) => {
                    e.stopPropagation();
                    void window.gdocsApi.closeTab(tab.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeTab && (
        <DarkModeMenu
          tabId={activeTab.id}
          config={activeTab.darkMode}
          collapsed={sidebarCollapsed}
        />
      )}

      <SyncStatus
        status={syncStatus}
        collapsed={sidebarCollapsed}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  );
};
