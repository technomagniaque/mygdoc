import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, 'gdocs-ferdium');
}

export function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

export function getExtensionsBaseDir(): string {
  return ensureDir(path.join(getConfigDir(), 'extensions'));
}

export function getMappingsFilePath(): string {
  ensureDir(getConfigDir());
  return path.join(getConfigDir(), 'mappings.json');
}

export function getSettingsFilePath(): string {
  ensureDir(getConfigDir());
  return path.join(getConfigDir(), 'settings.json');
}

export function getOAuthCredentialsFilePath(): string {
  ensureDir(getConfigDir());
  return path.join(getConfigDir(), 'oauth-credentials.json');
}

export function getOAuthTokenFilePath(): string {
  ensureDir(getConfigDir());
  return path.join(getConfigDir(), 'oauth-tokens.enc');
}
