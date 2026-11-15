import { ipcRenderer } from 'electron';
import * as DarkReader from 'darkreader';
import {
  DEFAULT_DARK_MODE_CONFIG,
  DarkModeConfig,
  IPC_CHANNELS,
} from '../shared/types';

let currentConfig: DarkModeConfig = { ...DEFAULT_DARK_MODE_CONFIG };
const CUSTOM_STYLE_ID = 'gdocs-ferdium-readability-css';

function buildReadabilityCss(config: DarkModeConfig): string {
  const invertRatio = (config.canvasInvert / 100).toFixed(3);
  const canvasContrastRatio = (config.canvasContrast / 100).toFixed(2);
  const brightnessRatio = (config.brightness / 100).toFixed(2);
  const sepiaRatio = (config.sepia / 100).toFixed(2);

  const canvasFilter = config.invertDocumentCanvas
    ? `
      /* Inversion et contraste pilotés manuellement par les sliders en temps réel */
      .kix-canvas-tile-content {
        filter: invert(${invertRatio}) hue-rotate(180deg) contrast(${canvasContrastRatio}) brightness(${brightnessRatio}) sepia(${sepiaRatio}) !important;
      }
      /* Curseur de texte toujours bien visible sur fond sombre */
      .kix-cursor-caret {
        border-color: #60a5fa !important;
        box-shadow: 0 0 2px rgba(96, 165, 250, 0.7) !important;
      }
      /* Règle graduée lisible */
      .kix-ruler-face-inner,
      .kix-ruler-background-inner {
        filter: invert(${invertRatio}) hue-rotate(180deg) contrast(${canvasContrastRatio}) !important;
      }
    `
    : '';

  return `
    /* Arrière-plan autour de la feuille bien distinct pour reposer les yeux */
    .kix-appview-editor,
    #docs-editor-container {
      background-color: #16181a !important;
    }

    /* Bordure subtile autour de chaque page pour la délimiter proprement */
    .kix-page-paginated {
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.55), 0 0 0 1px #2d3136 !important;
    }

    /* Menus, barre d'outils, barre de plan et commentaires : contraste élevé garanti */
    #docs-header,
    .docs-titlebar-buttons,
    .docs-menubar,
    .docs-toolbar-wrapper,
    .goog-menu,
    .docos-stream-view,
    .navigation-widget {
      color: ${config.darkSchemeTextColor} !important;
    }

    .goog-menuitem-content,
    .docs-title-input {
      color: ${config.darkSchemeTextColor} !important;
    }

    /* Préserve les couleurs naturelles des images, vidéos et avatars */
    img,
    video,
    .docs-thumbnail-image {
      filter: none !important;
    }

    ${canvasFilter}
  `;
}

function syncCustomReadabilityStyle(config: DarkModeConfig): void {
  const existing = document.getElementById(CUSTOM_STYLE_ID);
  if (!config.enabled) {
    existing?.remove();
    return;
  }

  const target = document.head || document.documentElement;
  if (!target) return;

  const styleEl = existing || document.createElement('style');
  styleEl.id = CUSTOM_STYLE_ID;
  styleEl.textContent = buildReadabilityCss(config);
  if (!existing) {
    target.appendChild(styleEl);
  }
}

function applyDarkMode(config: DarkModeConfig): void {
  currentConfig = { ...config };
  try {
    if (!config.enabled) {
      DarkReader.disable();
      syncCustomReadabilityStyle(config);
      return;
    }

    DarkReader.setFetchMethod(window.fetch.bind(window));
    DarkReader.enable(
      {
        brightness: config.brightness,
        contrast: config.contrast,
        sepia: config.sepia,
        darkSchemeBackgroundColor: config.darkSchemeBackgroundColor,
        darkSchemeTextColor: config.darkSchemeTextColor,
      },
      {
        invert: [],
        css: buildReadabilityCss(config),
        ignoreInlineStyle: [],
        ignoreImageAnalysis: ['img', 'svg', 'canvas.kix-canvas-tile-content'],
        disableStyleSheetsProxy: false,
      }
    );
    syncCustomReadabilityStyle(config);
  } catch {
    // Ignore les erreurs transitoires avant que document.head ne soit prêt
  }
}

ipcRenderer.on(
  IPC_CHANNELS.DARKMODE_APPLY_IN_WEBVIEW,
  (_event, config: DarkModeConfig) => {
    applyDarkMode(config);
  }
);

window.addEventListener('DOMContentLoaded', () => {
  applyDarkMode(currentConfig);
});

window.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 's') {
      e.preventDefault();
      e.stopPropagation();
      void ipcRenderer.invoke(IPC_CHANNELS.SYNC_FORCE_EXPORT);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'd') {
      e.preventDefault();
      e.stopPropagation();
      void ipcRenderer.invoke(IPC_CHANNELS.DARKMODE_TOGGLE_ACTIVE);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 't') {
      e.preventDefault();
      e.stopPropagation();
      void ipcRenderer.invoke(IPC_CHANNELS.TAB_CREATE, {
        url: 'https://docs.google.com/document/create',
        title: 'Nouveau Google Doc',
        kind: 'docs',
      });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      void ipcRenderer.invoke(IPC_CHANNELS.TAB_CLOSE);
      return;
    }

    if (e.ctrlKey && key === 'tab') {
      e.preventDefault();
      e.stopPropagation();
      void ipcRenderer.invoke(IPC_CHANNELS.TAB_NEXT);
    }
  },
  true
);
