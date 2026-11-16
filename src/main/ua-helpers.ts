export const WORKSPACE_PARTITION = 'persist:google-workspace';
export const FIREFOX_LOGIN_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0';

/**
 * Construit un User-Agent Chrome propre sans marqueurs Electron / mygdoc.
 */
export function buildCleanChromeUserAgent(rawUa?: string): string {
  const chromeVersion = process.versions.chrome || '134.0.0.0';
  if (!rawUa) {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  return rawUa
    .replace(/\sElectron\/[^\s]+/g, '')
    .replace(/\s(gdocs-ferdium|mygdoc)\/[^\s]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Construit l'en-tête Sec-CH-UA cohérent avec Chrome stable.
 */
export function buildGoogleChromeSecChUa(chromeFullVersion?: string): string {
  const major = (chromeFullVersion || process.versions.chrome || '134.0.0.0').split('.')[0];
  return `"Not:A-Brand";v="24", "Chromium";v="${major}", "Google Chrome";v="${major}"`;
}

/**
 * Construit l'en-tête Sec-CH-UA-Full-Version-List cohérent avec Chrome stable.
 */
export function buildGoogleChromeFullVersionList(chromeFullVersion?: string): string {
  const full = chromeFullVersion || process.versions.chrome || '134.0.0.0';
  return `"Not:A-Brand";v="24.0.0.0", "Chromium";v="${full}", "Google Chrome";v="${full}"`;
}

export function isGoogleAuthUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return (
      host === 'accounts.google.com' ||
      host.endsWith('.accounts.google.com') ||
      host === 'accounts.youtube.com'
    );
  } catch {
    return false;
  }
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
