import { session, Session } from 'electron';

export const WORKSPACE_PARTITION = 'persist:google-workspace';

const ALLOWED_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-write',
  'clipboard-sanitized-write',
  'persistent-storage',
  'notifications',
  'background-sync',
  'storage-access',
  'top-level-storage-access',
]);

export function buildCleanChromeUserAgent(rawUa?: string): string {
  const chromeVersion = process.versions.chrome || '134.0.0.0';
  if (!rawUa) {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  return rawUa
    .replace(/\sElectron\/[^\s]+/g, '')
    .replace(/\sgdocs-ferdium\/[^\s]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTrustedGoogleOrigin(originUrl: string | undefined): boolean {
  if (!originUrl) return false;
  if (originUrl.startsWith('chrome-extension://')) return true;
  try {
    const parsed = new URL(originUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.gstatic.com')
    );
  } catch {
    return false;
  }
}

export function configureGoogleWorkspaceSession(): Session {
  const ses = session.fromPartition(WORKSPACE_PARTITION);
  const cleanUa = buildCleanChromeUserAgent(ses.getUserAgent());

  ses.setUserAgent(cleanUa);

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = cleanUa;
    callback({ requestHeaders: headers });
  });

  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (ALLOWED_PERMISSIONS.has(permission) && isTrustedGoogleOrigin(requestingOrigin)) {
      return true;
    }
    return false;
  });

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    if (ALLOWED_PERMISSIONS.has(permission) && isTrustedGoogleOrigin(url)) {
      callback(true);
      return;
    }
    callback(false);
  });

  return ses;
}
