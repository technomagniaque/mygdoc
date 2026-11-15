import test from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import {
  BridgeTabAdapter,
  MyGDocRemoteBridge,
  isAllowedRemoteUrl,
} from '../src/main/remote-bridge';
import { DEFAULT_DARK_MODE_CONFIG, TabItem } from '../src/shared/types';

function createMockAdapter(): BridgeTabAdapter {
  const tabs: TabItem[] = [
    {
      id: 'tab-1',
      title: 'Mon Document',
      url: 'https://docs.google.com/document/d/doc123/edit',
      kind: 'docs',
      pinned: false,
      googleFileId: 'doc123',
      darkMode: { ...DEFAULT_DARK_MODE_CONFIG },
    },
  ];
  let activeId = 'tab-1';

  return {
    getAppVersion: () => '1.0.0',
    getTabs: () => tabs.map((t) => ({ ...t })),
    getActiveTabId: () => activeId,
    async openOrNavigateTab(opts) {
      const id = opts.tabId || `tab-${tabs.length + 1}`;
      let existing = tabs.find((t) => t.id === id);
      if (!existing) {
        existing = {
          id,
          title: 'Nouvelle page',
          url: opts.url,
          kind: 'custom',
          darkMode: { ...DEFAULT_DARK_MODE_CONFIG },
        };
        tabs.push(existing);
      } else {
        existing.url = opts.url;
      }
      if (opts.active !== false) activeId = existing.id;
      return {
        id: existing.id,
        title: existing.title,
        url: existing.url,
        kind: existing.kind,
        active: existing.id === activeId,
      };
    },
    async manageTab(tabId, action) {
      const target = tabs.find((t) => t.id === (tabId || activeId)) || tabs[0];
      if (action === 'activate') activeId = target.id;
      return {
        id: target.id,
        title: target.title,
        url: target.url,
        kind: target.kind,
        active: target.id === activeId,
      };
    },
    async executeScript<T>(_tabId: string | undefined, script: string): Promise<T> {
      if (script.includes('data-agy-ref')) {
        return {
          title: 'Mon Document',
          url: 'https://docs.google.com/document/d/doc123/edit',
          elementCount: 1,
          elements: [{ ref: 'ref_1', tag: 'button', name: 'Partager' }],
        } as T;
      }
      if (script.includes('performance.getEntriesByType')) {
        return [{ name: 'https://docs.google.com/static.js', initiatorType: 'script', durationMs: 12, transferSize: 512 }] as T;
      }
      return { ok: true, evaluated: true } as T;
    },
    async captureScreenshot(tabId) {
      const target = tabs.find((t) => t.id === (tabId || activeId)) || tabs[0];
      return {
        tabId: target.id,
        url: target.url,
        title: target.title,
        base64: Buffer.from('fake-png-bytes').toString('base64'),
      };
    },
    getConsoleLogs() {
      return [{ level: 'info', message: 'ready', timestamp: '2026-11-15T18:00:00.000Z' }];
    },
  };
}

function httpJson(
  port: number,
  method: 'GET' | 'POST',
  pathUrl: string,
  payload?: unknown
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathUrl,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : undefined,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data) as Record<string, unknown>));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('isAllowedRemoteUrl autorise uniquement http et https', () => {
  assert.equal(isAllowedRemoteUrl('https://docs.google.com/document/d/123/edit'), true);
  assert.equal(isAllowedRemoteUrl('http://127.0.0.1:8080'), true);
  assert.equal(isAllowedRemoteUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedRemoteUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedRemoteUrl('not-a-url'), false);
});

test('MyGDocRemoteBridge expose /health, /rpc et respecte le mode pause', async () => {
  const bridge = new MyGDocRemoteBridge({
    adapter: createMockAdapter(),
    basePort: 19381,
    enabled: true,
    paused: false,
  });

  await bridge.start();
  const status = bridge.getStatus();
  assert.equal(status.listening, true);
  assert.ok(status.port !== null);
  const port = status.port!;

  try {
    const health = await httpJson(port, 'GET', '/health');
    assert.equal(health.ok, true);
    assert.equal(health.target, 'mygdoc');
    assert.equal(health.tabCount, 1);

    const tabsRes = await httpJson(port, 'POST', '/rpc', { method: 'chrome_list_tabs' });
    assert.equal(tabsRes.ok, true);
    assert.equal((tabsRes.result as { tabs: unknown[] }).tabs.length, 1);

    const readRes = await httpJson(port, 'POST', '/rpc', { method: 'chrome_read_page' });
    assert.equal(readRes.ok, true);
    assert.equal((readRes.result as { elementCount: number }).elementCount, 1);

    const shotRes = await httpJson(port, 'POST', '/rpc', {
      method: 'chrome_screenshot',
      params: { format: 'png' },
    });
    assert.equal(shotRes.ok, true);
    assert.equal(typeof (shotRes.result as { base64: string }).base64, 'string');

    const blockedUrlRes = await httpJson(port, 'POST', '/rpc', {
      method: 'chrome_open_url',
      params: { url: 'file:///etc/passwd' },
    });
    assert.equal(blockedUrlRes.ok, false);

    // En pause : chrome_status autorisé, chrome_read_page refusé
    bridge.setPaused(true);
    const statusWhilePaused = await httpJson(port, 'POST', '/rpc', { method: 'chrome_status' });
    assert.equal(statusWhilePaused.ok, true);
    const readWhilePaused = await httpJson(port, 'POST', '/rpc', { method: 'chrome_read_page' });
    assert.equal(readWhilePaused.ok, false);
  } finally {
    await bridge.stop();
  }
});
