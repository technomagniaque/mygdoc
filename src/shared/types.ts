export type ServiceKind =
  | 'drive'
  | 'docs'
  | 'sheets'
  | 'slides'
  | 'custom';

export interface DarkModeConfig {
  enabled: boolean;
  invertDocumentCanvas: boolean;
  canvasInvert: number;
  canvasContrast: number;
  brightness: number;
  contrast: number;
  sepia: number;
  darkSchemeBackgroundColor: string;
  darkSchemeTextColor: string;
}

export const DEFAULT_DARK_MODE_CONFIG: DarkModeConfig = {
  enabled: true,
  invertDocumentCanvas: true,
  canvasInvert: 88,
  canvasContrast: 94,
  brightness: 98,
  contrast: 96,
  sepia: 6,
  darkSchemeBackgroundColor: '#1e1e1e',
  darkSchemeTextColor: '#e2e4e9',
};

export interface TabItem {
  id: string;
  title: string;
  url: string;
  kind: ServiceKind;
  pinned?: boolean;
  googleFileId?: string;
  localPath?: string;
  darkMode: DarkModeConfig;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export interface CustomService {
  id: string;
  name: string;
  url: string;
  iconText: string;
}

export type ExportFormat = 'docx' | 'odt' | 'pdf' | 'txt' | 'md';

export interface FileMapping {
  localPath: string;
  googleFileId: string;
  lastSyncHash: string;
  lastRemoteModifiedTime: string;
  autoExportFormat: ExportFormat;
  title: string;
}

export interface RemoteBridgeStatus {
  enabled: boolean;
  paused: boolean;
  listening: boolean;
  port: number | null;
  lastAction?: string;
  lastActionAt?: string;
  error?: string;
}

export interface SyncStatusState {
  online: boolean;
  oauthConnected: boolean;
  extensionLoaded: boolean;
  extensionVersion?: string;
  syncing: boolean;
  lastSyncAt?: string;
  lastError?: string;
  activeMapping?: FileMapping;
}

export interface OAuthCredentialsInput {
  clientId: string;
  clientSecret: string;
}

export const IPC_CHANNELS = {
  STATE_GET: 'app:state-get',
  STATE_UPDATED: 'app:state-updated',
  TAB_CREATE: 'tab:create',
  TAB_ACTIVATE: 'tab:activate',
  TAB_CLOSE: 'tab:close',
  TAB_NEXT: 'tab:next',
  TAB_NAVIGATE: 'tab:navigate',
  TAB_RELOAD: 'tab:reload',
  TAB_GO_BACK: 'tab:go-back',
  TAB_GO_FORWARD: 'tab:go-forward',
  SIDEBAR_TOGGLE: 'sidebar:toggle',
  DARKMODE_UPDATE: 'darkmode:update',
  DARKMODE_TOGGLE_ACTIVE: 'darkmode:toggle-active',
  DARKMODE_APPLY_IN_WEBVIEW: 'darkmode:apply-in-webview',
  SERVICE_ADD_CUSTOM: 'service:add-custom',
  SERVICE_REMOVE_CUSTOM: 'service:remove-custom',
  SYNC_FORCE_EXPORT: 'sync:force-export',
  SYNC_IMPORT_DIALOG: 'sync:import-dialog',
  OAUTH_CONNECT: 'oauth:connect',
  OAUTH_SAVE_CREDENTIALS: 'oauth:save-credentials',
  OAUTH_DISCONNECT: 'oauth:disconnect',
  EXTENSION_CHECK_UPDATE: 'extension:check-update',
  REMOTE_BRIDGE_SET_ENABLED: 'remote-bridge:set-enabled',
  REMOTE_BRIDGE_SET_PAUSED: 'remote-bridge:set-paused',
  APP_SET_MODAL_OPEN: 'app:set-modal-open',
} as const;

export interface AppStateSnapshot {
  tabs: TabItem[];
  activeTabId: string;
  sidebarCollapsed: boolean;
  customServices: CustomService[];
  syncStatus: SyncStatusState;
  remoteBridge: RemoteBridgeStatus;
  hasOAuthCredentials: boolean;
}
