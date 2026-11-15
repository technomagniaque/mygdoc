import { app } from 'electron';
import type { ServiceKind, TabItem } from '../shared/types';
import type { BridgeTabAdapter, BridgeTabSummary } from './remote-bridge';
import type { TabManager } from './tab-manager';

function inferServiceKindFromUrl(rawUrl: string): ServiceKind {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.startsWith('drive.')) return 'drive';
    if (host.startsWith('docs.')) return 'docs';
    if (host.startsWith('sheets.')) return 'sheets';
    if (host.startsWith('slides.')) return 'slides';
  } catch {
    // URL invalide ignorée
  }
  return 'custom';
}

function toSummary(meta: TabItem, activeId: string): BridgeTabSummary {
  return {
    id: meta.id,
    title: meta.title,
    url: meta.url,
    kind: meta.kind,
    active: meta.id === activeId,
    googleFileId: meta.googleFileId,
    localPath: meta.localPath,
  };
}

function waitForLoad(wc: Electron.WebContents, timeoutMs: number): Promise<void> {
  if (!wc.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const onDone = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      wc.removeListener('did-finish-load', onDone);
      wc.removeListener('did-fail-load', onDone);
    };

    wc.once('did-finish-load', onDone);
    wc.once('did-fail-load', onDone);
  });
}

export function createElectronBridgeAdapter(tabManager: TabManager): BridgeTabAdapter {
  const requireTab = (tabId?: string) => {
    const entry = tabManager.getManagedWebContents(tabId);
    if (!entry) {
      throw new Error('Aucun onglet actif dans MyGDoc.');
    }
    return entry;
  };

  return {
    getAppVersion: () => app.getVersion(),
    getTabs: () => tabManager.getTabs(),
    getActiveTabId: () => tabManager.getActiveTabId(),

    async openOrNavigateTab(opts) {
      let targetId = opts.tabId;
      if (targetId) {
        const entry = requireTab(targetId);
        if (opts.active !== false) tabManager.activateTab(targetId);
        await entry.wc.loadURL(opts.url);
      } else if (opts.newTab !== false) {
        targetId = tabManager.createTab({
          url: opts.url,
          title: 'Page distante',
          kind: inferServiceKindFromUrl(opts.url),
          activate: opts.active !== false,
        });
      } else {
        const entry = requireTab();
        targetId = entry.meta.id;
        await entry.wc.loadURL(opts.url);
      }

      const refreshed = requireTab(targetId);
      if (opts.waitForLoad !== false) {
        await waitForLoad(refreshed.wc, opts.timeoutMs || 15000);
      }
      const finalEntry = requireTab(targetId);
      return toSummary(finalEntry.meta, tabManager.getActiveTabId());
    },

    async manageTab(tabId, action) {
      const entry = requireTab(tabId);
      const id = entry.meta.id;

      if (action === 'activate') {
        tabManager.activateTab(id);
      } else if (action === 'close') {
        tabManager.closeTab(id);
      } else if (action === 'reload') {
        tabManager.reloadTab(id);
        await waitForLoad(entry.wc, 15000);
      } else if (action === 'go_back') {
        tabManager.goBackTab(id);
      } else if (action === 'go_forward') {
        tabManager.goForwardTab(id);
      }

      const current = tabManager.getManagedWebContents(id)?.meta || entry.meta;
      return toSummary(current, tabManager.getActiveTabId());
    },

    async executeScript<T = unknown>(tabId: string | undefined, script: string): Promise<T> {
      const { wc } = requireTab(tabId);
      return (await wc.executeJavaScript(script, true)) as T;
    },

    async captureScreenshot(tabId, format) {
      const { meta, wc } = requireTab(tabId);
      if (meta.id !== tabManager.getActiveTabId()) {
        tabManager.activateTab(meta.id);
        await new Promise((r) => setTimeout(r, 90));
      }
      const image = await wc.capturePage();
      const buf = format === 'jpeg' ? image.toJPEG(85) : image.toPNG();
      return {
        tabId: meta.id,
        url: meta.url,
        title: meta.title,
        base64: buf.toString('base64'),
      };
    },

    async clickAt(tabId, x, y, doubleClick) {
      const { wc } = requireTab(tabId);
      const clickCount = doubleClick ? 2 : 1;
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount });
    },

    async insertTextNative(tabId, text, pressEnter) {
      const { wc } = requireTab(tabId);
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3');
      }
      await wc.debugger.sendCommand('Input.insertText', { text });
      if (pressEnter) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      }
    },

    async pressKeyNative(tabId, key, modifiers) {
      const { wc } = requireTab(tabId);
      const normalized = key === 'Enter' ? 'Return' : key;
      const mods = (modifiers || []).filter((m): m is 'shift' | 'control' | 'alt' | 'meta' =>
        ['shift', 'control', 'alt', 'meta'].includes(m)
      );
      wc.sendInputEvent({ type: 'keyDown', keyCode: normalized, modifiers: mods });
      if (normalized.length === 1) {
        wc.sendInputEvent({ type: 'char', keyCode: normalized, modifiers: mods });
      }
      wc.sendInputEvent({ type: 'keyUp', keyCode: normalized, modifiers: mods });
    },

    getConsoleLogs(tabId, limit) {
      return tabManager.getConsoleLogs(tabId, limit);
    },
  };
}
