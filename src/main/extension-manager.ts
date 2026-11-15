import { Session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getExtensionsBaseDir } from './app-paths';
import { unpackCrxToDir } from './crx-parser';

export const GDOCS_OFFLINE_EXTENSION_ID = 'ghbmnnjooekpmoecnnnilnnbdlolhkhi';
const UPDATE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

interface ExtensionMeta {
  lastCheckedAt: number;
  version?: string;
}

export interface ExtensionLoadResult {
  loaded: boolean;
  version?: string;
  path: string;
  error?: string;
}

function getExtensionDir(): string {
  return path.join(getExtensionsBaseDir(), GDOCS_OFFLINE_EXTENSION_ID);
}

function getMetaPath(): string {
  return path.join(getExtensionsBaseDir(), `${GDOCS_OFFLINE_EXTENSION_ID}.meta.json`);
}

function readMeta(): ExtensionMeta {
  const metaPath = getMetaPath();
  if (!fs.existsSync(metaPath)) {
    return { lastCheckedAt: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as ExtensionMeta;
  } catch {
    return { lastCheckedAt: 0 };
  }
}

function writeMeta(meta: ExtensionMeta): void {
  fs.writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), 'utf-8');
}

function readManifestVersion(extDir: string): string | undefined {
  const manifestPath = path.join(extDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      version?: string;
    };
    return manifest.version;
  } catch {
    return undefined;
  }
}

function buildCrxDownloadUrl(): string {
  const chromeMajor = (process.versions.chrome || '134.0.0.0').split('.')[0];
  const prodVersion = `${chromeMajor}.0`;
  return `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(
    prodVersion
  )}&acceptformat=crx2,crx3&x=id%3D${GDOCS_OFFLINE_EXTENSION_ID}%26uc`;
}

export async function downloadAndInstallExtension(): Promise<string | undefined> {
  const url = buildCrxDownloadUrl();
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Échec téléchargement CRX Google Docs Offline (${response.status} ${response.statusText})`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const crxBuffer = Buffer.from(arrayBuffer);
  const extDir = getExtensionDir();

  unpackCrxToDir(crxBuffer, extDir);
  const version = readManifestVersion(extDir);
  writeMeta({ lastCheckedAt: Date.now(), version });
  return version;
}

export async function ensureAndLoadGoogleDocsOfflineExtension(
  ses: Session
): Promise<ExtensionLoadResult> {
  const extDir = getExtensionDir();
  const manifestExists = fs.existsSync(path.join(extDir, 'manifest.json'));

  if (!manifestExists) {
    try {
      await downloadAndInstallExtension();
    } catch (err) {
      return {
        loaded: false,
        path: extDir,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  try {
    const loadedExt = await ses.loadExtension(extDir, { allowFileAccess: true });
    const version = loadedExt.version || readManifestVersion(extDir);

    // Vérification hebdomadaire silencieuse en arrière-plan
    const meta = readMeta();
    if (Date.now() - meta.lastCheckedAt > UPDATE_CHECK_INTERVAL_MS) {
      void checkForExtensionUpdateSilently();
    }

    return {
      loaded: true,
      version,
      path: extDir,
    };
  } catch (err) {
    return {
      loaded: false,
      path: extDir,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkForExtensionUpdateSilently(): Promise<{
  updated: boolean;
  version?: string;
}> {
  try {
    const currentVersion = readManifestVersion(getExtensionDir());
    const newVersion = await downloadAndInstallExtension();
    return {
      updated: Boolean(newVersion && newVersion !== currentVersion),
      version: newVersion,
    };
  } catch {
    writeMeta({ ...readMeta(), lastCheckedAt: Date.now() });
    return { updated: false };
  }
}
