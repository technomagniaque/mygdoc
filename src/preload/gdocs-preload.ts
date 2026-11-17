import { ipcRenderer, webFrame } from 'electron';
import * as DarkReader from 'darkreader';
import {
  DEFAULT_DARK_MODE_CONFIG,
  DarkModeConfig,
  GoogleLoginUaMode,
  IPC_CHANNELS,
} from '../shared/types';

let currentConfig: DarkModeConfig = { ...DEFAULT_DARK_MODE_CONFIG };
const CUSTOM_STYLE_ID = 'gdocs-ferdium-readability-css';

function isGoogleAuthPage(): boolean {
  try {
    const host = window.location.hostname.toLowerCase();
    return (
      host === 'accounts.google.com' ||
      host.endsWith('.accounts.google.com') ||
      host === 'accounts.youtube.com'
    );
  } catch {
    return false;
  }
}

const FIREFOX_LOGIN_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0';

function getActiveLoginUaMode(): GoogleLoginUaMode {
  try {
    const mode = ipcRenderer.sendSync(IPC_CHANNELS.AUTH_GET_LOGIN_UA_MODE);
    return mode === 'firefox-login' ? 'firefox-login' : 'chrome-coherent';
  } catch {
    return 'chrome-coherent';
  }
}

function patchMainWorldNavigator(): void {
  const mode = isGoogleAuthPage() ? getActiveLoginUaMode() : 'chrome-coherent';
  const script = `(() => {
    try {
      if (!/^https?:$/i.test(location.protocol)) return;
      try {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true,
        });
      } catch {}

      const mode = ${JSON.stringify(mode)};
      const firefoxUa = ${JSON.stringify(FIREFOX_LOGIN_USER_AGENT)};
      if (mode === 'firefox-login') {
        try {
          Object.defineProperty(navigator, 'userAgent', {
            get: () => firefoxUa,
            configurable: true,
          });
          Object.defineProperty(navigator, 'appVersion', {
            get: () => '5.0 (X11)',
            configurable: true,
          });
          Object.defineProperty(navigator, 'platform', {
            get: () => 'Linux x86_64',
            configurable: true,
          });
          Object.defineProperty(navigator, 'vendor', {
            get: () => '',
            configurable: true,
          });
          Object.defineProperty(navigator, 'userAgentData', {
            get: () => undefined,
            configurable: true,
          });
        } catch {}
        return;
      }

      const ua = navigator.userAgent || '';
      const chromeMatch = ua.match(/Chrome\\/(\\d+(?:\\.\\d+)*)/);
      if (!chromeMatch) return;
      const fullVersion = chromeMatch[1];
      const majorVersion = fullVersion.split('.')[0];
      const brands = [
        { brand: 'Not:A-Brand', version: '24' },
        { brand: 'Chromium', version: majorVersion },
        { brand: 'Google Chrome', version: majorVersion },
      ];
      const fullVersionList = [
        { brand: 'Not:A-Brand', version: '24.0.0.0' },
        { brand: 'Chromium', version: fullVersion },
        { brand: 'Google Chrome', version: fullVersion },
      ];
      const coherentUad = {
        brands: brands.map((b) => ({ ...b })),
        mobile: false,
        platform: 'Linux',
        getHighEntropyValues: async (hints) => {
          const base = {
            brands: brands.map((b) => ({ ...b })),
            mobile: false,
            platform: 'Linux',
          };
          const high = {
            architecture: 'x86',
            bitness: '64',
            fullVersionList: fullVersionList.map((b) => ({ ...b })),
            model: '',
            platformVersion: '6.12.0',
            uaFullVersion: fullVersion,
            wow64: false,
          };
          if (!Array.isArray(hints) || hints.length === 0) {
            return { ...base, ...high };
          }
          const out = { ...base };
          for (const h of hints) {
            if (Object.prototype.hasOwnProperty.call(high, h)) {
              out[h] = high[h];
            }
          }
          return out;
        },
        toJSON: () => ({
          brands: brands.map((b) => ({ ...b })),
          mobile: false,
          platform: 'Linux',
        }),
      };

      Object.defineProperty(navigator, 'userAgentData', {
        get: () => coherentUad,
        configurable: true,
      });
    } catch {}
  })();`;

  void webFrame.executeJavaScript(script).catch(() => {
    // Ignorer avant l'initialisation complète du frame
  });
}

patchMainWorldNavigator();

function isGoogleEditorPage(): boolean {
  try {
    return window.location.hostname.toLowerCase() === 'docs.google.com';
  } catch {
    return false;
  }
}

function buildReadabilityCss(config: DarkModeConfig): string {
  const invertRatio = (config.canvasInvert / 100).toFixed(3);
  const canvasContrastRatio = (config.canvasContrast / 100).toFixed(2);
  const uiContrastRatio = (config.contrast / 100).toFixed(2);
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

  const googleEditorDarkCss = isGoogleEditorPage()
    ? `
      html, body {
        background-color: #141618 !important;
        color: ${config.darkSchemeTextColor} !important;
        color-scheme: dark !important;
      }

      /* Empêche l'overlay transparent Google Meet de devenir opaque et de masquer les menus */
      #meet-captured-region {
        background: transparent !important;
      }

      /* Barre supérieure, menus (Fichier, Modifier, Afficher...) et barre d'outils */
      #docs-chrome {
        background-color: ${config.darkSchemeBackgroundColor} !important;
        color: ${config.darkSchemeTextColor} !important;
        border-bottom: 1px solid #2e3238 !important;
        filter: contrast(${uiContrastRatio}) brightness(${brightnessRatio}) sepia(${sepiaRatio}) !important;
      }

      #docs-chrome * {
        background-color: transparent !important;
      }

      #docs-chrome .docs-icon-img-container {
        overflow: hidden !important;
      }

      #docs-chrome .docs-title-input,
      #docs-chrome .menu-button,
      #docs-chrome .goog-toolbar-button,
      #docs-chrome .goog-toolbar-menu-button,
      #docs-chrome .goog-toolbar-combo-button-caption,
      #docs-chrome .goog-toolbar-select .goog-toolbar-menu-button-caption {
        color: ${config.darkSchemeTextColor} !important;
      }

      #docs-chrome .goog-toolbar-button-hover,
      #docs-chrome .goog-toolbar-menu-button-hover,
      #docs-chrome .goog-control-hover,
      #docs-chrome .menu-button.goog-control-open {
        background-color: rgba(255, 255, 255, 0.12) !important;
        border-radius: 4px !important;
      }

      #docs-chrome .goog-toolbar-button-checked,
      #docs-chrome .goog-toolbar-button-active {
        background-color: rgba(96, 165, 250, 0.24) !important;
        border-radius: 4px !important;
      }

      #docs-chrome .docs-icon-img,
      #docs-chrome svg {
        filter: invert(0.88) hue-rotate(180deg) brightness(1.08) !important;
      }

      #docs-chrome .docs-titlebar-badge img,
      #docs-chrome .gb_B img {
        filter: none !important;
      }

      /* Bouton Partager */
      #docs-titlebar-share-client-button .jfk-button,
      #docs-titlebar-share-client-button [role="button"] {
        background-color: #1d4ed8 !important;
        color: #ffffff !important;
        border-radius: 18px !important;
      }

      /* Menus déroulants et sous-menus */
      .goog-menu {
        background-color: #23262a !important;
        border: 1px solid #383d45 !important;
        color: ${config.darkSchemeTextColor} !important;
      }

      .goog-menuitem,
      .goog-menuitem-content,
      .goog-menuitem-accel {
        color: ${config.darkSchemeTextColor} !important;
      }

      .goog-menuitem-highlight,
      .goog-menuitem-hover {
        background-color: #32373e !important;
      }

      /* Panneau Plan du document & barre compagnon droite */
      .left-sidebar-container,
      .navigation-widget,
      .navigation-widget-content,
      .companion-collapser-button-container,
      .docs-companion-app-switcher-container {
        background-color: #1b1d20 !important;
        color: ${config.darkSchemeTextColor} !important;
        border-color: #2c3036 !important;
        filter: contrast(${uiContrastRatio}) brightness(${brightnessRatio}) !important;
      }

      .navigation-item-content,
      .navigation-widget-header {
        color: ${config.darkSchemeTextColor} !important;
      }

      /* Règle horizontale Google Docs */
      #kix-horizontal-ruler,
      .docs-ruler-inner {
        background-color: #1b1d20 !important;
        border-color: #2c3036 !important;
      }
    `
    : '';

  return `
    ${googleEditorDarkCss}

    /* Arrière-plan autour de la feuille bien distinct pour reposer les yeux */
    .kix-appview-editor,
    #docs-editor-container,
    #docs-editor {
      background-color: #141618 !important;
    }

    /* Bordure subtile autour de chaque page pour la délimiter proprement */
    .kix-page-paginated {
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.6), 0 0 0 1px #2f343b !important;
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
    // Ne pas envelopper window.fetch ni injecter DarkReader sur accounts.google.com (BotGuard)
    if (isGoogleAuthPage()) {
      DarkReader.disable();
      document.getElementById(CUSTOM_STYLE_ID)?.remove();
      return;
    }

    // Toujours appliquer le CSS de lisibilité et les curseurs avant DarkReader
    syncCustomReadabilityStyle(config);

    // Sur docs.google.com (CSP TrustedScript), DarkReader échoue et laisse un fallback
    // qui rend #meet-captured-region opaque ; le thème sombre CSS natif gère tout proprement.
    if (!config.enabled || isGoogleEditorPage()) {
      DarkReader.disable();
      return;
    }

    DarkReader.setFetchMethod(window.fetch.bind(window));
    try {
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
          disableStyleSheetsProxy: true,
        }
      );
    } catch {
      DarkReader.disable();
    }
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
