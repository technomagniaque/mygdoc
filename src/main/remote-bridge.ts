import * as http from 'node:http';
import type { RemoteBridgeStatus, ServiceKind, TabItem } from '../shared/types';
import {
  buildClickScript,
  buildFillFormScript,
  buildHighlightScript,
  buildHoverScript,
  buildNetworkPerfScript,
  buildReadPageScript,
  buildScrollScript,
  buildTypeScript,
  buildWaitForScript,
} from './remote-dom-scripts';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 17381;
const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_WHEN_PAUSED = new Set(['chrome_status', 'chrome_list_tabs']);

export interface BridgeTabSummary {
  id: string;
  title: string;
  url: string;
  kind: ServiceKind;
  active: boolean;
  googleFileId?: string;
  localPath?: string;
}

export interface BridgeTabAdapter {
  getAppVersion: () => string;
  getTabs: () => TabItem[];
  getActiveTabId: () => string;
  openOrNavigateTab: (opts: {
    url: string;
    tabId?: string;
    newTab?: boolean;
    active?: boolean;
    waitForLoad?: boolean;
    timeoutMs?: number;
  }) => Promise<BridgeTabSummary>;
  manageTab: (
    tabId: string | undefined,
    action: 'activate' | 'close' | 'reload' | 'go_back' | 'go_forward'
  ) => Promise<BridgeTabSummary>;
  executeScript: <T = unknown>(tabId: string | undefined, script: string) => Promise<T>;
  captureScreenshot: (
    tabId: string | undefined,
    format: 'png' | 'jpeg'
  ) => Promise<{ tabId: string; url: string; title: string; base64: string }>;
  clickAt?: (
    tabId: string | undefined,
    x: number,
    y: number,
    doubleClick?: boolean
  ) => Promise<void>;
  insertTextNative?: (
    tabId: string | undefined,
    text: string,
    pressEnter?: boolean
  ) => Promise<void>;
  pressKeyNative?: (
    tabId: string | undefined,
    key: string,
    modifiers?: string[]
  ) => Promise<void>;
  getConsoleLogs: (tabId: string | undefined, limit?: number) => unknown[];
}

export function isAllowedRemoteUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface RemoteBridgeOptions {
  adapter: BridgeTabAdapter;
  basePort?: number;
  enabled?: boolean;
  paused?: boolean;
  onStatusChange?: () => void;
}

export class MyGDocRemoteBridge {
  private readonly adapter: BridgeTabAdapter;
  private readonly basePort: number;
  private readonly onStatusChange?: () => void;
  private server: http.Server | null = null;
  private listeningPort: number | null = null;
  private enabled: boolean;
  private paused: boolean;
  private controlledTabId: string | null = null;
  private lastAction?: string;
  private lastActionAt?: string;
  private lastError?: string;

  constructor(opts: RemoteBridgeOptions) {
    this.adapter = opts.adapter;
    this.basePort = opts.basePort || Number(process.env.MYGDOC_BRIDGE_PORT || DEFAULT_PORT);
    this.enabled = opts.enabled !== false;
    this.paused = Boolean(opts.paused);
    this.onStatusChange = opts.onStatusChange;
  }

  getStatus(): RemoteBridgeStatus {
    return {
      enabled: this.enabled,
      paused: this.paused,
      listening: Boolean(this.server && this.listeningPort !== null),
      port: this.listeningPort,
      lastAction: this.lastAction,
      lastActionAt: this.lastActionAt,
      error: this.lastError,
    };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (enabled) {
      await this.start();
    } else {
      await this.stop();
    }
    this.onStatusChange?.();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.recordAction(paused ? 'Contrôle mis en pause' : 'Contrôle réactivé');
    this.onStatusChange?.();
  }

  private recordAction(summary: string): void {
    this.lastAction = summary;
    this.lastActionAt = new Date().toISOString();
    this.onStatusChange?.();
  }

  async start(): Promise<void> {
    if (!this.enabled || this.server) return;

    this.lastError = undefined;
    for (let offset = 0; offset < 9; offset += 1) {
      const candidatePort = this.basePort + offset;
      try {
        await this.listenOnPort(candidatePort);
        this.listeningPort = candidatePort;
        this.onStatusChange?.();
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'EADDRINUSE') {
          this.lastError = err instanceof Error ? err.message : String(err);
          this.onStatusChange?.();
          return;
        }
      }
    }

    this.lastError = `Aucun port libre trouvé (${this.basePort}-${this.basePort + 8})`;
    this.onStatusChange?.();
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    this.listeningPort = null;
    await new Promise<void>((resolve) => {
      srv.close(() => resolve());
    });
    this.onStatusChange?.();
  }

  private listenOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
        void this.handleHttpRequest(req, res);
      });

      const onError = (err: Error) => {
        srv.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        srv.removeListener('error', onError);
        this.server = srv;
        resolve();
      };

      srv.once('error', onError);
      srv.once('listening', onListening);
      srv.listen(port, HOST);
    });
  }

  private resolveTargetTabId(tabId?: unknown): string | undefined {
    const requested = typeof tabId === 'string' && tabId ? tabId : undefined;
    const tabs = this.adapter.getTabs();
    if (requested && tabs.some((t) => t.id === requested)) {
      this.controlledTabId = requested;
      return requested;
    }
    const activeId = this.adapter.getActiveTabId();
    if (activeId) {
      this.controlledTabId = activeId;
      return activeId;
    }
    return tabs[0]?.id;
  }

  private listTabSummaries(): BridgeTabSummary[] {
    const activeId = this.adapter.getActiveTabId();
    return this.adapter.getTabs().map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      kind: t.kind,
      active: t.id === activeId,
      googleFileId: t.googleFileId,
      localPath: t.localPath,
    }));
  }

  async handleRpc(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    if (this.paused && !ALLOWED_WHEN_PAUSED.has(method)) {
      return {
        ok: false,
        error:
          'Contrôle à distance en pause dans MyGDoc. Réactivez-le depuis la barre latérale ou les Paramètres.',
      };
    }

    try {
      const targetTabId = this.resolveTargetTabId(params.tabId);

      switch (method) {
        case 'chrome_status': {
          const tabs = this.listTabSummaries();
          return {
            ok: true,
            result: {
              target: 'mygdoc',
              version: this.adapter.getAppVersion(),
              connected: true,
              paused: this.paused,
              port: this.listeningPort,
              controlledTabId: this.controlledTabId || this.adapter.getActiveTabId(),
              windowCount: 1,
              tabCount: tabs.length,
              activeTab: tabs.find((t) => t.active) || null,
            },
          };
        }

        case 'chrome_list_tabs':
          return { ok: true, result: { tabs: this.listTabSummaries() } };

        case 'chrome_open_url': {
          const rawUrl = String(params.url || '').trim();
          if (!rawUrl || !isAllowedRemoteUrl(rawUrl)) {
            return {
              ok: false,
              error: 'URL invalide ou protocole non autorisé (http/https uniquement).',
            };
          }
          const opened = await this.adapter.openOrNavigateTab({
            url: rawUrl,
            tabId: typeof params.tabId === 'string' ? params.tabId : undefined,
            newTab: params.newTab !== false,
            active: params.active !== false,
            waitForLoad: params.waitForLoad !== false,
            timeoutMs: Number(params.timeoutMs || 15000),
          });
          this.controlledTabId = opened.id;
          let snapshot: unknown = null;
          if (params.includeSnapshot !== false) {
            try {
              snapshot = await this.adapter.executeScript(
                opened.id,
                buildReadPageScript({ maxElements: 150 })
              );
            } catch {
              // Ignorer si la page est encore en cours d'initialisation
            }
          }
          this.recordAction(`chrome_open_url: ${rawUrl}`);
          return { ok: true, result: { ...opened, tabId: opened.id, snapshot } };
        }

        case 'chrome_read_page': {
          const snapshot = await this.adapter.executeScript(
            targetTabId,
            buildReadPageScript({
              maxElements: params.maxElements as number | undefined,
              maxTextLength: params.maxTextLength as number | undefined,
            })
          );
          this.recordAction(`chrome_read_page (${targetTabId || 'active'})`);
          return { ok: true, result: { tabId: targetTabId, ...(snapshot as object) } };
        }

        case 'chrome_click': {
          if (
            params.useCdp &&
            typeof params.x === 'number' &&
            typeof params.y === 'number' &&
            this.adapter.clickAt
          ) {
            await this.adapter.clickAt(
              targetTabId,
              params.x,
              params.y,
              Boolean(params.doubleClick)
            );
            this.recordAction(`chrome_click (${params.x},${params.y})`);
            return {
              ok: true,
              result: {
                tabId: targetTabId,
                clicked: true,
                coordinates: { x: params.x, y: params.y },
              },
            };
          }

          const clickRes = await this.adapter.executeScript<{
            clicked: boolean;
            name?: string;
            coordinates?: { x: number; y: number };
          }>(targetTabId, buildClickScript(params));

          if (params.useCdp && clickRes.coordinates && this.adapter.clickAt) {
            await this.adapter.clickAt(
              targetTabId,
              clickRes.coordinates.x,
              clickRes.coordinates.y,
              Boolean(params.doubleClick)
            );
          }
          this.recordAction(`chrome_click: ${clickRes.name || params.ref || params.selector || 'ok'}`);
          return { ok: true, result: { tabId: targetTabId, ...clickRes } };
        }

        case 'chrome_hover': {
          const hoverRes = await this.adapter.executeScript<Record<string, unknown>>(
            targetTabId,
            buildHoverScript(params)
          );
          this.recordAction('chrome_hover');
          return { ok: true, result: { tabId: targetTabId, ...hoverRes } };
        }

        case 'chrome_highlight': {
          const hlRes = await this.adapter.executeScript<Record<string, unknown>>(
            targetTabId,
            buildHighlightScript(params)
          );
          return { ok: true, result: { tabId: targetTabId, ...hlRes } };
        }

        case 'chrome_type': {
          const text = String(params.text ?? '');
          if (params.useCdp && !params.ref && !params.selector && this.adapter.insertTextNative) {
            await this.adapter.insertTextNative(targetTabId, text, Boolean(params.pressEnter));
            this.recordAction('chrome_type (CDP)');
            return { ok: true, result: { tabId: targetTabId, typed: true, mode: 'cdp' } };
          }
          const typeRes = await this.adapter.executeScript<Record<string, unknown>>(
            targetTabId,
            buildTypeScript(params)
          );
          this.recordAction('chrome_type');
          return { ok: true, result: { tabId: targetTabId, ...typeRes } };
        }

        case 'chrome_fill_form': {
          const fields = Array.isArray(params.fields)
            ? (params.fields as Array<Record<string, unknown>>)
            : [];
          const fillRes = await this.adapter.executeScript<Record<string, unknown>>(
            targetTabId,
            buildFillFormScript(fields)
          );
          this.recordAction(`chrome_fill_form (${fields.length})`);
          return { ok: true, result: { tabId: targetTabId, ...fillRes } };
        }

        case 'chrome_press_key': {
          const key = String(params.key || '');
          if (!key) return { ok: false, error: 'Le paramètre "key" est requis.' };
          const modifiers = Array.isArray(params.modifiers)
            ? params.modifiers.map(String)
            : undefined;
          if (this.adapter.pressKeyNative) {
            await this.adapter.pressKeyNative(targetTabId, key, modifiers);
          } else {
            await this.adapter.executeScript(
              targetTabId,
              `(() => {
                const el = document.activeElement || document.body;
                el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, bubbles: true }));
              })()`
            );
          }
          this.recordAction(`chrome_press_key: ${key}`);
          return { ok: true, result: { tabId: targetTabId, key } };
        }

        case 'chrome_scroll': {
          const scrollRes = await this.adapter.executeScript<Record<string, unknown>>(
            targetTabId,
            buildScrollScript(params)
          );
          return { ok: true, result: { tabId: targetTabId, ...scrollRes } };
        }

        case 'chrome_wait_for': {
          const waitRes = await this.adapter.executeScript<Record<string, unknown>>(
            targetTabId,
            buildWaitForScript(params)
          );
          return { ok: true, result: { tabId: targetTabId, ...waitRes } };
        }

        case 'chrome_screenshot': {
          const format = params.format === 'jpeg' ? 'jpeg' : 'png';
          const shot = await this.adapter.captureScreenshot(targetTabId, format);
          this.recordAction(`chrome_screenshot (${format})`);
          return {
            ok: true,
            result: {
              ...shot,
              format,
            },
          };
        }

        case 'chrome_evaluate': {
          const expression = String(params.expression || params.script || '');
          if (!expression) return { ok: false, error: 'Le paramètre "expression" est requis.' };
          const value = await this.adapter.executeScript(targetTabId, expression);
          this.recordAction('chrome_evaluate');
          return { ok: true, result: { tabId: targetTabId, value } };
        }

        case 'chrome_get_console_logs': {
          const logs = this.adapter.getConsoleLogs(
            targetTabId,
            typeof params.limit === 'number' ? params.limit : 100
          );
          return { ok: true, result: { tabId: targetTabId, logs } };
        }

        case 'chrome_get_network_logs': {
          const perfRequests = await this.adapter.executeScript<unknown[]>(
            targetTabId,
            buildNetworkPerfScript(typeof params.limit === 'number' ? params.limit : 50)
          );
          return {
            ok: true,
            result: {
              tabId: targetTabId,
              performanceResources: perfRequests,
              cdpNetworkEvents: [],
            },
          };
        }

        case 'chrome_manage_tabs': {
          const rawAction = String(params.action || 'activate');
          const allowedActions = new Set([
            'activate',
            'close',
            'reload',
            'go_back',
            'go_forward',
          ]);
          if (!allowedActions.has(rawAction)) {
            return { ok: false, error: `Action d'onglet non supportée: ${rawAction}` };
          }
          const updated = await this.adapter.manageTab(
            targetTabId,
            rawAction as 'activate' | 'close' | 'reload' | 'go_back' | 'go_forward'
          );
          this.recordAction(`chrome_manage_tabs: ${rawAction}`);
          return { ok: true, result: updated };
        }

        default:
          return { ok: false, error: `Méthode RPC inconnue: ${method}` };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'GET' && req.url === '/health') {
      const tabs = this.listTabSummaries();
      res.end(
        JSON.stringify({
          ok: true,
          target: 'mygdoc',
          app: 'mygdoc',
          version: this.adapter.getAppVersion(),
          port: this.listeningPort,
          enabled: this.enabled,
          paused: this.paused,
          tabCount: tabs.length,
          activeTabId: this.adapter.getActiveTabId(),
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/rpc') {
      try {
        const rawBody = await readJsonBody(req);
        const parsed = JSON.parse(rawBody || '{}') as {
          method?: string;
          params?: Record<string, unknown>;
        };
        if (!parsed.method) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Missing method' }));
          return;
        }
        const rpcRes = await this.handleRpc(parsed.method, parsed.params || {});
        res.end(JSON.stringify(rpcRes));
      } catch (err) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload RPC trop volumineux.'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
