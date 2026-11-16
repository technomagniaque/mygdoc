import { BaseWindow, dialog, ipcMain, net } from 'electron';
import {
  AppStateSnapshot,
  CustomService,
  DarkModeConfig,
  GoogleLoginUaMode,
  IPC_CHANNELS,
  OAuthCredentialsInput,
  ServiceKind,
} from '../shared/types';
import { getGoogleLoginUaMode, setGoogleLoginUaMode } from './session-config';
import { TabManager } from './tab-manager';
import { SettingsStore } from './settings-store';
import { GoogleAuthManager } from './google-auth';
import { DriveSyncService } from './drive-sync';
import { FileMapper } from './file-mapper';
import { checkForExtensionUpdateSilently } from './extension-manager';
import { MyGDocRemoteBridge } from './remote-bridge';

export interface AppContext {
  win: BaseWindow;
  tabManager: TabManager;
  settingsStore: SettingsStore;
  authManager: GoogleAuthManager;
  driveSync: DriveSyncService;
  fileMapper: FileMapper;
  remoteBridge: MyGDocRemoteBridge;
  extensionStatus: { loaded: boolean; version?: string };
  broadcastState: () => void;
  openLocalFile: (filePath: string) => Promise<void>;
}

export function buildStateSnapshot(ctx: AppContext): AppStateSnapshot {
  const settings = ctx.settingsStore.get();
  const activeTab = ctx.tabManager.getActiveTab();
  const activeMapping = activeTab?.googleFileId
    ? ctx.fileMapper.findByGoogleFileId(activeTab.googleFileId)
    : undefined;
  const syncState = ctx.driveSync.getSyncState();

  return {
    tabs: ctx.tabManager.getTabs(),
    activeTabId: ctx.tabManager.getActiveTabId(),
    sidebarCollapsed: ctx.tabManager.getSidebarCollapsed(),
    customServices: settings.customServices,
    hasOAuthCredentials: ctx.authManager.hasCredentials(),
    loginUaMode: settings.loginUaMode,
    authRejected: ctx.tabManager.isAuthRejected(),
    remoteBridge: ctx.remoteBridge.getStatus(),
    syncStatus: {
      online: net.isOnline(),
      oauthConnected: ctx.authManager.isConnected(),
      extensionLoaded: ctx.extensionStatus.loaded,
      extensionVersion: ctx.extensionStatus.version,
      syncing: syncState.syncing,
      lastSyncAt: syncState.lastSyncAt,
      lastError: syncState.lastError,
      activeMapping,
    },
  };
}

export function registerIpcHandlers(ctx: AppContext): void {
  ipcMain.handle(IPC_CHANNELS.STATE_GET, () => buildStateSnapshot(ctx));

  ipcMain.handle(
    IPC_CHANNELS.TAB_CREATE,
    (_e, opts: { url: string; title: string; kind: ServiceKind }) => {
      ctx.tabManager.createTab({ ...opts, activate: true });
    }
  );

  ipcMain.handle(IPC_CHANNELS.TAB_ACTIVATE, (_e, tabId: string) => {
    ctx.tabManager.activateTab(tabId);
  });

  ipcMain.handle(IPC_CHANNELS.TAB_CLOSE, (_e, tabId?: string) => {
    ctx.tabManager.closeTab(tabId);
  });

  ipcMain.handle(IPC_CHANNELS.TAB_NEXT, () => {
    ctx.tabManager.activateNextTab();
  });

  ipcMain.handle(IPC_CHANNELS.TAB_RELOAD, (_e, tabId?: string) => {
    ctx.tabManager.reloadTab(tabId);
  });

  ipcMain.handle(IPC_CHANNELS.TAB_GO_BACK, () => {
    ctx.tabManager.goBackActive();
  });

  ipcMain.handle(IPC_CHANNELS.TAB_GO_FORWARD, () => {
    ctx.tabManager.goForwardActive();
  });

  ipcMain.handle(IPC_CHANNELS.SIDEBAR_TOGGLE, () => {
    const next = !ctx.tabManager.getSidebarCollapsed();
    ctx.tabManager.setSidebarCollapsed(next);
    ctx.settingsStore.setSidebarCollapsed(next);
  });

  ipcMain.handle(
    IPC_CHANNELS.DARKMODE_UPDATE,
    (_e, tabId: string, config: Partial<DarkModeConfig>) => {
      ctx.tabManager.updateDarkMode(tabId, config);
    }
  );

  ipcMain.handle(IPC_CHANNELS.DARKMODE_TOGGLE_ACTIVE, () => {
    ctx.tabManager.toggleDarkModeActive();
  });

  ipcMain.handle(
    IPC_CHANNELS.SERVICE_ADD_CUSTOM,
    (_e, service: Omit<CustomService, 'id'>) => {
      ctx.settingsStore.addCustomService(service);
      ctx.broadcastState();
    }
  );

  ipcMain.handle(IPC_CHANNELS.SERVICE_REMOVE_CUSTOM, (_e, serviceId: string) => {
    ctx.settingsStore.removeCustomService(serviceId);
    ctx.broadcastState();
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_FORCE_EXPORT, async () => {
    const active = ctx.tabManager.getActiveTab();
    if (!active?.googleFileId) return false;
    return ctx.driveSync.exportToLocal(active.googleFileId, true);
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_IMPORT_DIALOG, async () => {
    const result = await dialog.showOpenDialog(ctx.win, {
      title: 'Importer un document local vers Google Docs',
      properties: ['openFile'],
      filters: [
        {
          name: 'Documents compatibles',
          extensions: ['docx', 'doc', 'odt', 'rtf', 'txt', 'md'],
        },
      ],
    });

    if (!result.canceled && result.filePaths[0]) {
      await ctx.openLocalFile(result.filePaths[0]);
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.OAUTH_SAVE_CREDENTIALS,
    (_e, creds: OAuthCredentialsInput) => {
      ctx.authManager.saveClientCredentials(creds);
      ctx.broadcastState();
    }
  );

  ipcMain.handle(IPC_CHANNELS.OAUTH_CONNECT, async () => {
    try {
      await ctx.authManager.startInteractiveLogin();
      ctx.broadcastState();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.OAUTH_DISCONNECT, () => {
    ctx.authManager.disconnect();
    ctx.broadcastState();
  });

  ipcMain.handle(IPC_CHANNELS.EXTENSION_CHECK_UPDATE, async () => {
    const res = await checkForExtensionUpdateSilently();
    if (res.version) {
      ctx.extensionStatus.version = res.version;
      ctx.broadcastState();
    }
    return res;
  });

  ipcMain.handle(IPC_CHANNELS.APP_SET_MODAL_OPEN, (_e, open: boolean) => {
    ctx.tabManager.setModalOpen(open);
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_BRIDGE_SET_ENABLED, async (_e, enabled: boolean) => {
    ctx.settingsStore.setRemoteBridgeEnabled(enabled);
    await ctx.remoteBridge.setEnabled(enabled);
    ctx.broadcastState();
  });

  ipcMain.handle(IPC_CHANNELS.REMOTE_BRIDGE_SET_PAUSED, (_e, paused: boolean) => {
    ctx.settingsStore.setRemoteBridgePaused(paused);
    ctx.remoteBridge.setPaused(paused);
    ctx.broadcastState();
  });

  ipcMain.on(IPC_CHANNELS.AUTH_GET_LOGIN_UA_MODE, (event) => {
    event.returnValue = getGoogleLoginUaMode();
  });

  ipcMain.handle(
    IPC_CHANNELS.AUTH_SET_LOGIN_UA_MODE,
    (_e, mode: GoogleLoginUaMode, retryDriveLogin = false) => {
      ctx.settingsStore.setLoginUaMode(mode);
      setGoogleLoginUaMode(mode);
      ctx.tabManager.refreshAllUserAgents();
      if (retryDriveLogin) {
        ctx.tabManager.retryGoogleDriveLogin();
      } else {
        ctx.broadcastState();
      }
    }
  );
}
