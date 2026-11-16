import { contextBridge, ipcRenderer } from 'electron';
import {
  AppStateSnapshot,
  CustomService,
  DarkModeConfig,
  GoogleLoginUaMode,
  IPC_CHANNELS,
  OAuthCredentialsInput,
  ServiceKind,
} from '../shared/types';

export interface HostApi {
  getState: () => Promise<AppStateSnapshot>;
  onStateUpdated: (cb: (state: AppStateSnapshot) => void) => () => void;
  createTab: (opts: { url: string; title: string; kind: ServiceKind }) => Promise<void>;
  activateTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  reloadTab: (tabId?: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  toggleSidebar: () => Promise<void>;
  updateDarkMode: (tabId: string, config: Partial<DarkModeConfig>) => Promise<void>;
  addCustomService: (service: Omit<CustomService, 'id'>) => Promise<void>;
  removeCustomService: (serviceId: string) => Promise<void>;
  forceExportActive: () => Promise<boolean>;
  openImportDialog: () => Promise<void>;
  connectOAuth: () => Promise<{ ok: boolean; error?: string }>;
  saveOAuthCredentials: (creds: OAuthCredentialsInput) => Promise<void>;
  disconnectOAuth: () => Promise<void>;
  checkExtensionUpdate: () => Promise<{ updated: boolean; version?: string }>;
  setRemoteBridgeEnabled: (enabled: boolean) => Promise<void>;
  setRemoteBridgePaused: (paused: boolean) => Promise<void>;
  setLoginUaMode: (mode: GoogleLoginUaMode, retryDriveLogin?: boolean) => Promise<void>;
  setModalOpen: (open: boolean) => Promise<void>;
}

const api: HostApi = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.STATE_GET),
  onStateUpdated: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppStateSnapshot) => cb(state);
    ipcRenderer.on(IPC_CHANNELS.STATE_UPDATED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATE_UPDATED, listener);
  },
  createTab: (opts) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CREATE, opts),
  activateTab: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.TAB_ACTIVATE, tabId),
  closeTab: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.TAB_CLOSE, tabId),
  reloadTab: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.TAB_RELOAD, tabId),
  goBack: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_GO_BACK),
  goForward: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_GO_FORWARD),
  toggleSidebar: () => ipcRenderer.invoke(IPC_CHANNELS.SIDEBAR_TOGGLE),
  updateDarkMode: (tabId, config) => ipcRenderer.invoke(IPC_CHANNELS.DARKMODE_UPDATE, tabId, config),
  addCustomService: (service) => ipcRenderer.invoke(IPC_CHANNELS.SERVICE_ADD_CUSTOM, service),
  removeCustomService: (serviceId) => ipcRenderer.invoke(IPC_CHANNELS.SERVICE_REMOVE_CUSTOM, serviceId),
  forceExportActive: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_FORCE_EXPORT),
  openImportDialog: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_IMPORT_DIALOG),
  connectOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.OAUTH_CONNECT),
  saveOAuthCredentials: (creds) => ipcRenderer.invoke(IPC_CHANNELS.OAUTH_SAVE_CREDENTIALS, creds),
  disconnectOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.OAUTH_DISCONNECT),
  checkExtensionUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.EXTENSION_CHECK_UPDATE),
  setRemoteBridgeEnabled: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.REMOTE_BRIDGE_SET_ENABLED, enabled),
  setRemoteBridgePaused: (paused) => ipcRenderer.invoke(IPC_CHANNELS.REMOTE_BRIDGE_SET_PAUSED, paused),
  setLoginUaMode: (mode, retryDriveLogin) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_SET_LOGIN_UA_MODE, mode, retryDriveLogin),
  setModalOpen: (open) => ipcRenderer.invoke(IPC_CHANNELS.APP_SET_MODAL_OPEN, open),
};

contextBridge.exposeInMainWorld('gdocsApi', api);
