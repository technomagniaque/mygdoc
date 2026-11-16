import { session, Session } from 'electron';
import { GoogleLoginUaMode } from '../shared/types';
import {
  FIREFOX_LOGIN_USER_AGENT,
  WORKSPACE_PARTITION,
  buildCleanChromeUserAgent,
  buildGoogleChromeFullVersionList,
  buildGoogleChromeSecChUa,
  isGoogleAuthUrl,
  isTrustedGoogleOrigin,
} from './ua-helpers';

export {
  FIREFOX_LOGIN_USER_AGENT,
  WORKSPACE_PARTITION,
  buildCleanChromeUserAgent,
  buildGoogleChromeFullVersionList,
  buildGoogleChromeSecChUa,
  isGoogleAuthUrl,
  isTrustedGoogleOrigin,
};

let activeLoginUaMode: GoogleLoginUaMode = 'chrome-coherent';

export function setGoogleLoginUaMode(mode: GoogleLoginUaMode): void {
  activeLoginUaMode = mode;
}

export function getGoogleLoginUaMode(): GoogleLoginUaMode {
  return activeLoginUaMode;
}

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

function setOrReplaceHeader(
  headers: Record<string, string | string[]>,
  targetName: string,
  value: string
): void {
  const lowerTarget = targetName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerTarget) {
      delete headers[key];
    }
  }
  headers[targetName] = value;
}

function deleteHeadersByPrefix(
  headers: Record<string, string | string[]>,
  prefixLower: string
): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase().startsWith(prefixLower)) {
      delete headers[key];
    }
  }
}

export function configureGoogleWorkspaceSession(initialMode: GoogleLoginUaMode = 'chrome-coherent'): Session {
  activeLoginUaMode = initialMode;
  const ses = session.fromPartition(WORKSPACE_PARTITION);
  const cleanUa = buildCleanChromeUserAgent(ses.getUserAgent());
  const secChUa = buildGoogleChromeSecChUa();
  const secChUaFull = buildGoogleChromeFullVersionList();

  ses.setUserAgent(cleanUa);

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    const useFirefoxOnAuth =
      activeLoginUaMode === 'firefox-login' && isGoogleAuthUrl(details.url);

    if (useFirefoxOnAuth) {
      setOrReplaceHeader(headers, 'User-Agent', FIREFOX_LOGIN_USER_AGENT);
      deleteHeadersByPrefix(headers, 'sec-ch-ua');
    } else {
      setOrReplaceHeader(headers, 'User-Agent', cleanUa);
      if (isTrustedGoogleOrigin(details.url)) {
        setOrReplaceHeader(headers, 'Sec-CH-UA', secChUa);
        setOrReplaceHeader(headers, 'Sec-CH-UA-Full-Version-List', secChUaFull);
        setOrReplaceHeader(headers, 'Sec-CH-UA-Platform', '"Linux"');
      }
    }

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
