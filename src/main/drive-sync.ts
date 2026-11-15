import * as fs from 'fs';
import * as path from 'path';
import { google, drive_v3 } from 'googleapis';
import { GoogleAuthManager } from './google-auth';
import { FileMapper, computeFileHash, inferExportFormat } from './file-mapper';
import { ExportFormat, FileMapping } from '../shared/types';

const IMPORTS_FOLDER_NAME = 'Imports_Dolphin';
const WATCH_INTERVAL_MS = 30_000;

const SUPPORTED_IMPORT_MIMES: Record<string, string> = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.txt': 'text/plain',
  '.md': 'text/plain',
  '.markdown': 'text/plain',
};

const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
};

export function isSupportedDocumentPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext in SUPPORTED_IMPORT_MIMES;
}

export class DriveSyncService {
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private lastSyncAt: string | undefined;
  private lastError: string | undefined;
  private onStatusChange?: () => void;

  constructor(
    private readonly authManager: GoogleAuthManager,
    private readonly fileMapper: FileMapper,
    onStatusChange?: () => void
  ) {
    this.onStatusChange = onStatusChange;
  }

  getSyncState() {
    return {
      syncing: this.syncing,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  private getDriveClient(): drive_v3.Drive {
    const client = this.authManager.getClient();
    if (!client) {
      throw new Error('Compte Google Drive non connecté (OAuth2 requis pour la synchro Dolphin).');
    }
    return google.drive({ version: 'v3', auth: client });
  }

  private async ensureImportsFolder(drive: drive_v3.Drive): Promise<string> {
    const res = await drive.files.list({
      q: `name = '${IMPORTS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const existing = res.data.files?.[0]?.id;
    if (existing) return existing;

    const created = await drive.files.create({
      requestBody: {
        name: IMPORTS_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    if (!created.data.id) {
      throw new Error(`Impossible de créer le dossier ${IMPORTS_FOLDER_NAME} sur Google Drive.`);
    }
    return created.data.id;
  }

  async importLocalFile(localPath: string): Promise<FileMapping> {
    const resolved = path.resolve(localPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Fichier local introuvable : ${resolved}`);
    }
    const ext = path.extname(resolved).toLowerCase();
    const sourceMime = SUPPORTED_IMPORT_MIMES[ext];
    if (!sourceMime) {
      throw new Error(`Extension non supportée pour l’import Google Docs : ${ext}`);
    }

    const existing = this.fileMapper.findByLocalPath(resolved);
    if (existing) {
      return existing;
    }

    this.syncing = true;
    this.lastError = undefined;
    this.onStatusChange?.();

    try {
      const drive = this.getDriveClient();
      const folderId = await this.ensureImportsFolder(drive);
      const baseName = path.basename(resolved, ext);

      const created = await drive.files.create({
        requestBody: {
          name: baseName,
          parents: [folderId],
          mimeType: 'application/vnd.google-apps.document',
        },
        media: {
          mimeType: sourceMime,
          body: fs.createReadStream(resolved),
        },
        fields: 'id, name, modifiedTime',
      });

      const fileId = created.data.id;
      if (!fileId) {
        throw new Error('Google Drive API n’a pas retourné d’ID de document.');
      }

      const mapping: FileMapping = {
        localPath: resolved,
        googleFileId: fileId,
        lastSyncHash: computeFileHash(resolved),
        lastRemoteModifiedTime: created.data.modifiedTime || new Date().toISOString(),
        autoExportFormat: inferExportFormat(resolved),
        title: created.data.name || baseName,
      };

      this.fileMapper.upsert(mapping);
      this.lastSyncAt = new Date().toISOString();
      return mapping;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.syncing = false;
      this.onStatusChange?.();
    }
  }

  async exportToLocal(googleFileId: string, force = false): Promise<boolean> {
    const mapping = this.fileMapper.findByGoogleFileId(googleFileId);
    if (!mapping || !this.authManager.isConnected()) {
      return false;
    }

    this.syncing = true;
    this.lastError = undefined;
    this.onStatusChange?.();

    try {
      const drive = this.getDriveClient();
      const meta = await drive.files.get({
        fileId: googleFileId,
        fields: 'id, name, modifiedTime',
      });

      const remoteModified = meta.data.modifiedTime || '';
      if (!force && remoteModified && remoteModified <= mapping.lastRemoteModifiedTime) {
        return false;
      }

      const exportMime = EXPORT_MIME_TYPES[mapping.autoExportFormat] || EXPORT_MIME_TYPES.docx;
      const exportRes = await drive.files.export(
        { fileId: googleFileId, mimeType: exportMime },
        { responseType: 'arraybuffer' }
      );

      const buffer = Buffer.from(exportRes.data as ArrayBuffer);
      const tmpPath = `${mapping.localPath}.gdocs-tmp`;
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, mapping.localPath);

      this.fileMapper.upsert({
        ...mapping,
        title: meta.data.name || mapping.title,
        lastSyncHash: computeFileHash(mapping.localPath),
        lastRemoteModifiedTime: remoteModified || new Date().toISOString(),
      });

      this.lastSyncAt = new Date().toISOString();
      return true;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.syncing = false;
      this.onStatusChange?.();
    }
  }

  async syncAllActiveMappings(activeFileIds: string[]): Promise<void> {
    if (this.syncing || !this.authManager.isConnected()) return;
    for (const fileId of activeFileIds) {
      await this.exportToLocal(fileId, false);
    }
  }

  startWatcher(getActiveFileIds: () => string[], isOnline: () => boolean): void {
    this.stopWatcher();
    this.timer = setInterval(() => {
      if (!isOnline() || !this.authManager.isConnected()) return;
      const ids = getActiveFileIds();
      if (ids.length > 0) {
        void this.syncAllActiveMappings(ids);
      }
    }, WATCH_INTERVAL_MS);
  }

  stopWatcher(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
