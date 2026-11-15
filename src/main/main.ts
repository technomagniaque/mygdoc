import { app, BaseWindow, WebContentsView, dialog, nativeTheme, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from '../shared/types';
import { configureGoogleWorkspaceSession } from './session-config';
import { ensureAndLoadGoogleDocsOfflineExtension } from './extension-manager';
import { SettingsStore } from './settings-store';
import { FileMapper } from './file-mapper';
import { GoogleAuthManager } from './google-auth';
import { DriveSyncService, isSupportedDocumentPath } from './drive-sync';
import { TabManager } from './tab-manager';
import { MyGDocRemoteBridge } from './remote-bridge';
import { createElectronBridgeAdapter } from './remote-bridge-electron';
import { AppContext, buildStateSnapshot, registerIpcHandlers } from './ipc-handlers';

// Flags Wayland & X11 pour KDE Plasma 6
app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function extractCliFilePaths(argv: string[]): string[] {
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => {
      if (arg.startsWith('file://')) {
        try {
          return decodeURIComponent(new URL(arg).pathname);
        } catch {
          return arg;
        }
      }
      return path.resolve(arg);
    })
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile() && isSupportedDocumentPath(p));
}

let appCtx: AppContext | null = null;

app.on('second-instance', (_event, commandLine) => {
  if (!appCtx) return;
  if (appCtx.win.isMinimized()) appCtx.win.restore();
  appCtx.win.focus();

  const files = extractCliFilePaths(commandLine);
  for (const file of files) {
    void appCtx.openLocalFile(file);
  }
});

async function bootstrap(): Promise<void> {
  await app.whenReady();
  nativeTheme.themeSource = 'dark';

  const ses = configureGoogleWorkspaceSession();
  const extResult = await ensureAndLoadGoogleDocsOfflineExtension(ses);
  if (!extResult.loaded) {
    console.warn('[gdocs-ferdium] Extension Google Docs Offline non chargée :', extResult.error);
  }

  const settingsStore = new SettingsStore();
  const fileMapper = new FileMapper();
  const authManager = new GoogleAuthManager();
  await authManager.restoreSession();

  const win = new BaseWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'Google Docs Desktop',
    backgroundColor: '#1b1e20',
  });

  const hostView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'host-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.contentView.addChildView(hostView);

  const extensionStatus = {
    loaded: extResult.loaded,
    version: extResult.version,
  };

  let tabManager!: TabManager;
  let driveSync!: DriveSyncService;
  let remoteBridge!: MyGDocRemoteBridge;

  const broadcastState = () => {
    if (!appCtx) return;
    hostView.webContents.send(IPC_CHANNELS.STATE_UPDATED, buildStateSnapshot(appCtx));
  };

  tabManager = new TabManager(win, hostView, settingsStore.get().sidebarCollapsed, broadcastState);
  driveSync = new DriveSyncService(authManager, fileMapper, broadcastState);
  const initialSettings = settingsStore.get();
  remoteBridge = new MyGDocRemoteBridge({
    adapter: createElectronBridgeAdapter(tabManager),
    enabled: initialSettings.remoteBridgeEnabled,
    paused: initialSettings.remoteBridgePaused,
    onStatusChange: broadcastState,
  });

  const openLocalFile = async (localPath: string): Promise<void> => {
    const resolved = path.resolve(localPath);
    const existingTab = tabManager.findTabByLocalPath(resolved);
    if (existingTab) {
      tabManager.activateTab(existingTab.id);
      return;
    }

    if (!authManager.isConnected()) {
      dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Connexion Google Drive requise',
        message: 'Connectez votre compte Google Drive (OAuth2) dans les paramètres pour importer automatiquement les fichiers depuis Dolphin.',
        detail: `Fichier demandé : ${resolved}`,
      });
      return;
    }

    try {
      const mapping = await driveSync.importLocalFile(resolved);
      const url = `https://docs.google.com/document/d/${mapping.googleFileId}/edit`;
      tabManager.createTab({
        url,
        title: mapping.title,
        kind: 'docs',
        googleFileId: mapping.googleFileId,
        localPath: mapping.localPath,
        activate: true,
      });
    } catch (err) {
      dialog.showErrorBox(
        'Erreur d’importation Dolphin',
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  appCtx = {
    win,
    tabManager,
    settingsStore,
    authManager,
    driveSync,
    fileMapper,
    remoteBridge,
    extensionStatus,
    broadcastState,
    openLocalFile,
  };

  registerIpcHandlers(appCtx);

  const rendererHtml = path.join(__dirname, '..', 'renderer', 'index.html');
  await hostView.webContents.loadFile(rendererHtml);

  tabManager.createTab({
    url: 'https://drive.google.com/drive/my-drive',
    title: 'Google Drive',
    kind: 'drive',
    pinned: true,
    activate: true,
  });

  tabManager.layout();

  await remoteBridge.start();

  const initialFiles = extractCliFilePaths(process.argv);
  for (const file of initialFiles) {
    void openLocalFile(file);
  }

  driveSync.startWatcher(
    () => tabManager.getActiveGoogleFileIds(),
    () => net.isOnline()
  );

  // Rafraîchit périodiquement l'état réseau dans l'UI
  const onlineMonitor = setInterval(() => {
    broadcastState();
  }, 15_000);

  win.on('closed', () => {
    clearInterval(onlineMonitor);
    driveSync.stopWatcher();
    void remoteBridge.stop();
  });
}

void bootstrap();

app.on('window-all-closed', () => {
  app.quit();
});
