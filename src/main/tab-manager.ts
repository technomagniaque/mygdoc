import { BaseWindow, WebContents, WebContentsView, shell } from 'electron';
import * as path from 'path';
import {
  DEFAULT_DARK_MODE_CONFIG,
  DarkModeConfig,
  IPC_CHANNELS,
  ServiceKind,
  TabItem,
} from '../shared/types';
import { WORKSPACE_PARTITION } from './session-config';

const SIDEBAR_EXPANDED_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const MAX_CONSOLE_LOGS = 200;

export interface TabConsoleLog {
  level: string;
  message: string;
  timestamp: string;
  sourceId?: string;
  line?: number;
}

interface ManagedTab {
  meta: TabItem;
  view: WebContentsView;
  consoleLogs: TabConsoleLog[];
}

export function extractGoogleFileId(rawUrl: string): string | undefined {
  const match = rawUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1];
}

export class TabManager {
  private tabs: ManagedTab[] = [];
  private activeTabId = '';
  private sidebarCollapsed = false;
  private modalOpen = false;
  private onChange?: () => void;

  constructor(
    private readonly win: BaseWindow,
    private readonly hostView: WebContentsView,
    initialCollapsed: boolean,
    onChange?: () => void
  ) {
    this.sidebarCollapsed = initialCollapsed;
    this.onChange = onChange;

    this.win.on('resize', () => this.layout());
  }

  getSidebarCollapsed(): boolean {
    return this.sidebarCollapsed;
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed = collapsed;
    this.layout();
    this.onChange?.();
  }

  setModalOpen(open: boolean): void {
    this.modalOpen = open;
    this.layout();
  }

  getTabs(): TabItem[] {
    return this.tabs.map((t) => ({ ...t.meta }));
  }

  getActiveTabId(): string {
    return this.activeTabId;
  }

  getActiveTab(): TabItem | undefined {
    return this.tabs.find((t) => t.meta.id === this.activeTabId)?.meta;
  }

  getManagedWebContents(tabId?: string): { meta: TabItem; wc: WebContents } | undefined {
    const targetId = tabId || this.activeTabId;
    const found = this.tabs.find((t) => t.meta.id === targetId);
    if (!found) return undefined;
    return { meta: { ...found.meta }, wc: found.view.webContents };
  }

  getConsoleLogs(tabId?: string, limit = 100): TabConsoleLog[] {
    const targetId = tabId || this.activeTabId;
    const found = this.tabs.find((t) => t.meta.id === targetId);
    if (!found) return [];
    return found.consoleLogs.slice(-Math.max(1, limit));
  }

  getActiveGoogleFileIds(): string[] {
    const ids = new Set<string>();
    for (const t of this.tabs) {
      if (t.meta.googleFileId) ids.add(t.meta.googleFileId);
    }
    return Array.from(ids);
  }

  createTab(opts: {
    url: string;
    title: string;
    kind: ServiceKind;
    pinned?: boolean;
    googleFileId?: string;
    localPath?: string;
    activate?: boolean;
  }): string {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const darkMode: DarkModeConfig = { ...DEFAULT_DARK_MODE_CONFIG };

    const view = new WebContentsView({
      webPreferences: {
        partition: WORKSPACE_PARTITION,
        preload: path.join(__dirname, '..', 'preload', 'gdocs-preload.js'),
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
      },
    });

    const meta: TabItem = {
      id,
      title: opts.title,
      url: opts.url,
      kind: opts.kind,
      pinned: opts.pinned,
      googleFileId: opts.googleFileId || extractGoogleFileId(opts.url),
      localPath: opts.localPath,
      darkMode,
      canGoBack: false,
      canGoForward: false,
    };

    const managed: ManagedTab = { meta, view, consoleLogs: [] };
    this.tabs.push(managed);
    this.win.contentView.addChildView(view);

    this.attachWebContentsListeners(managed);
    void view.webContents.loadURL(opts.url);

    if (opts.activate !== false || !this.activeTabId) {
      this.activateTab(id);
    } else {
      view.setVisible(false);
      this.onChange?.();
    }

    return id;
  }

  private attachWebContentsListeners(managed: ManagedTab): void {
    const { view, meta } = managed;
    const wc = view.webContents;

    wc.on('page-title-updated', (_e, title) => {
      if (!meta.pinned && title) {
        meta.title = title.replace(/\s*-\s*Google\s+(Docs|Drive|Sheets|Slides)$/i, '').trim() || title;
        this.onChange?.();
      }
    });

    const updateNavState = (url: string) => {
      meta.url = url;
      const detectedId = extractGoogleFileId(url);
      if (detectedId) meta.googleFileId = detectedId;
      meta.canGoBack = wc.navigationHistory.canGoBack();
      meta.canGoForward = wc.navigationHistory.canGoForward();
      this.onChange?.();
    };

    wc.on('did-navigate', (_e, url) => updateNavState(url));
    wc.on('did-navigate-in-page', (_e, url) => updateNavState(url));

    wc.on('console-message', (details, level, message, line, sourceId) => {
      const resolvedLevel = String(details?.level ?? level ?? 'info');
      const resolvedMsg = String(details?.message ?? message ?? '').slice(0, 2000);
      managed.consoleLogs.push({
        level: resolvedLevel,
        message: resolvedMsg,
        timestamp: new Date().toISOString(),
        sourceId: details?.sourceId ?? sourceId,
        line: details?.lineNumber ?? line,
      });
      if (managed.consoleLogs.length > MAX_CONSOLE_LOGS) {
        managed.consoleLogs.shift();
      }
    });

    wc.on('did-finish-load', () => {
      wc.send(IPC_CHANNELS.DARKMODE_APPLY_IN_WEBVIEW, meta.darkMode);
    });

    wc.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (
          host.endsWith('.google.com') ||
          host === 'google.com' ||
          host.endsWith('.googleusercontent.com')
        ) {
          this.createTab({
            url,
            title: 'Document Google',
            kind: url.includes('/document/') ? 'docs' : 'drive',
            activate: true,
          });
          return { action: 'deny' };
        }
      } catch {
        // URL invalide
      }
      void shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  activateTab(tabId: string): void {
    const exists = this.tabs.some((t) => t.meta.id === tabId);
    if (!exists) return;

    this.activeTabId = tabId;
    this.layout();
    this.onChange?.();
  }

  activateNextTab(): void {
    if (this.tabs.length <= 1) return;
    const idx = this.tabs.findIndex((t) => t.meta.id === this.activeTabId);
    const nextIdx = (idx + 1) % this.tabs.length;
    this.activateTab(this.tabs[nextIdx].meta.id);
  }

  closeTab(tabId?: string): void {
    const targetId = tabId || this.activeTabId;
    const idx = this.tabs.findIndex((t) => t.meta.id === targetId);
    if (idx < 0) return;

    const target = this.tabs[idx];
    if (target.meta.pinned) return;

    this.win.contentView.removeChildView(target.view);
    target.view.webContents.close();
    this.tabs.splice(idx, 1);

    if (this.activeTabId === targetId) {
      const fallback = this.tabs[Math.max(0, idx - 1)] || this.tabs[0];
      this.activeTabId = fallback ? fallback.meta.id : '';
    }

    this.layout();
    this.onChange?.();
  }

  reloadTab(tabId?: string): void {
    const targetId = tabId || this.activeTabId;
    const found = this.tabs.find((t) => t.meta.id === targetId);
    found?.view.webContents.reload();
  }

  goBackActive(): void {
    this.goBackTab(this.activeTabId);
  }

  goForwardActive(): void {
    this.goForwardTab(this.activeTabId);
  }

  goBackTab(tabId?: string): void {
    const found = this.tabs.find((t) => t.meta.id === (tabId || this.activeTabId));
    if (found?.view.webContents.navigationHistory.canGoBack()) {
      found.view.webContents.navigationHistory.goBack();
    }
  }

  goForwardTab(tabId?: string): void {
    const found = this.tabs.find((t) => t.meta.id === (tabId || this.activeTabId));
    if (found?.view.webContents.navigationHistory.canGoForward()) {
      found.view.webContents.navigationHistory.goForward();
    }
  }

  updateDarkMode(tabId: string, patch: Partial<DarkModeConfig>): void {
    const found = this.tabs.find((t) => t.meta.id === tabId);
    if (!found) return;
    found.meta.darkMode = { ...found.meta.darkMode, ...patch };
    found.view.webContents.send(IPC_CHANNELS.DARKMODE_APPLY_IN_WEBVIEW, found.meta.darkMode);
    this.onChange?.();
  }

  toggleDarkModeActive(): void {
    const active = this.getActiveTab();
    if (!active) return;
    this.updateDarkMode(active.id, { enabled: !active.darkMode.enabled });
  }

  findTabByLocalPath(localPath: string): TabItem | undefined {
    return this.tabs.find((t) => t.meta.localPath === localPath)?.meta;
  }

  layout(): void {
    const [width, height] = this.win.getContentSize();
    const sidebarWidth = this.sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

    this.hostView.setBounds({ x: 0, y: 0, width, height });

    for (const t of this.tabs) {
      const visible = !this.modalOpen && t.meta.id === this.activeTabId;
      t.view.setVisible(visible);
      if (visible) {
        t.view.setBounds({
          x: sidebarWidth,
          y: 0,
          width: Math.max(0, width - sidebarWidth),
          height,
        });
      }
    }
  }
}
