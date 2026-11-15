import React, { useEffect, useState } from 'react';
import { AppStateSnapshot } from '../shared/types';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [state, setState] = useState<AppStateSnapshot | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void window.gdocsApi.getState().then(setState);
    return window.gdocsApi.onStateUpdated(setState);
  }, []);

  const openSettings = () => {
    setShowSettings(true);
    void window.gdocsApi.setModalOpen(true);
  };

  const closeSettings = () => {
    setShowSettings(false);
    void window.gdocsApi.setModalOpen(false);
  };

  if (!state) {
    return <div className="app-shell" />;
  }

  return (
    <div className="app-shell">
      <Sidebar state={state} onOpenSettings={openSettings} />
      <main className="main-placeholder" />
      {showSettings && <SettingsModal state={state} onClose={closeSettings} />}
    </div>
  );
};
