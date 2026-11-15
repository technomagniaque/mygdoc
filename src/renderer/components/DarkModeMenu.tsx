import React from 'react';
import { DEFAULT_DARK_MODE_CONFIG, DarkModeConfig } from '../../shared/types';

interface DarkModeMenuProps {
  tabId: string;
  config: DarkModeConfig;
  collapsed: boolean;
}

const PRESETS: Array<{ label: string; patch: Partial<DarkModeConfig> }> = [
  {
    label: 'Doux',
    patch: {
      canvasInvert: 88,
      canvasContrast: 94,
      brightness: 98,
      contrast: 96,
      sepia: 6,
      darkSchemeBackgroundColor: '#1e1e1e',
      darkSchemeTextColor: '#e2e4e9',
    },
  },
  {
    label: 'Net +',
    patch: {
      canvasInvert: 91,
      canvasContrast: 112,
      brightness: 102,
      contrast: 108,
      sepia: 0,
      darkSchemeBackgroundColor: '#16181a',
      darkSchemeTextColor: '#f3f4f6',
    },
  },
  {
    label: 'Ambre',
    patch: {
      canvasInvert: 87,
      canvasContrast: 94,
      brightness: 95,
      contrast: 95,
      sepia: 18,
      darkSchemeBackgroundColor: '#1f1d1a',
      darkSchemeTextColor: '#e6dfd3',
    },
  },
];

export const DarkModeMenu: React.FC<DarkModeMenuProps> = ({
  tabId,
  config,
  collapsed,
}) => {
  const toggle = () => {
    void window.gdocsApi.updateDarkMode(tabId, { enabled: !config.enabled });
  };

  if (collapsed) {
    return (
      <div className="panel-box" style={{ alignItems: 'center' }}>
        <button
          className="icon-btn"
          title={`Thème sombre (${config.enabled ? 'ON' : 'OFF'}) — Ctrl+Shift+D`}
          onClick={toggle}
        >
          {config.enabled ? '🌙' : '☀️'}
        </button>
      </div>
    );
  }

  return (
    <div className="panel-box">
      <div className="panel-row">
        <span style={{ fontWeight: 600, fontSize: '12px' }}>Thème sombre</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {config.enabled && (
            <button
              className="toggle-pill"
              title="Réinitialiser les réglages par défaut"
              onClick={() =>
                void window.gdocsApi.updateDarkMode(tabId, DEFAULT_DARK_MODE_CONFIG)
              }
            >
              ↺
            </button>
          )}
          <button
            className={`toggle-pill ${config.enabled ? 'on' : ''}`}
            onClick={toggle}
            title="Ctrl+Shift+D"
          >
            {config.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {config.enabled && (
        <>
          <div style={{ display: 'flex', gap: '4px' }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="toggle-pill"
                style={{ flex: 1, textAlign: 'center' }}
                onClick={() => void window.gdocsApi.updateDarkMode(tabId, preset.patch)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="panel-row">
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Feuille sombre (Canvas)
            </span>
            <button
              className={`toggle-pill ${config.invertDocumentCanvas ? 'on' : ''}`}
              onClick={() =>
                void window.gdocsApi.updateDarkMode(tabId, {
                  invertDocumentCanvas: !config.invertDocumentCanvas,
                })
              }
            >
              {config.invertDocumentCanvas ? 'ON' : 'OFF'}
            </button>
          </div>

          {config.invertDocumentCanvas && (
            <>
              <div className="slider-group">
                <div className="slider-label">
                  <span>Contraste feuille</span>
                  <span>{config.canvasContrast}%</span>
                </div>
                <input
                  type="range"
                  min={70}
                  max={140}
                  value={config.canvasContrast}
                  onChange={(e) =>
                    void window.gdocsApi.updateDarkMode(tabId, {
                      canvasContrast: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="slider-group">
                <div className="slider-label">
                  <span>Noirceur fond feuille</span>
                  <span>{config.canvasInvert}%</span>
                </div>
                <input
                  type="range"
                  min={80}
                  max={96}
                  value={config.canvasInvert}
                  onChange={(e) =>
                    void window.gdocsApi.updateDarkMode(tabId, {
                      canvasInvert: Number(e.target.value),
                    })
                  }
                />
              </div>
            </>
          )}

          <div className="slider-group">
            <div className="slider-label">
              <span>Contraste menus / UI</span>
              <span>{config.contrast}%</span>
            </div>
            <input
              type="range"
              min={70}
              max={135}
              value={config.contrast}
              onChange={(e) =>
                void window.gdocsApi.updateDarkMode(tabId, {
                  contrast: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="slider-group">
            <div className="slider-label">
              <span>Luminosité</span>
              <span>{config.brightness}%</span>
            </div>
            <input
              type="range"
              min={70}
              max={115}
              value={config.brightness}
              onChange={(e) =>
                void window.gdocsApi.updateDarkMode(tabId, {
                  brightness: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="slider-group">
            <div className="slider-label">
              <span>Sépia</span>
              <span>{config.sepia}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={35}
              value={config.sepia}
              onChange={(e) =>
                void window.gdocsApi.updateDarkMode(tabId, {
                  sepia: Number(e.target.value),
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
};
