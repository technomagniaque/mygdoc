import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getMappingsFilePath } from './app-paths';
import { ExportFormat, FileMapping } from '../shared/types';

export function computeFileHash(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function inferExportFormat(localPath: string): ExportFormat {
  const ext = path.extname(localPath).toLowerCase().replace('.', '');
  switch (ext) {
    case 'doc':
    case 'docx':
      return 'docx';
    case 'odt':
      return 'odt';
    case 'pdf':
      return 'pdf';
    case 'md':
    case 'markdown':
      return 'md';
    case 'txt':
    case 'rtf':
    default:
      return 'txt';
  }
}

export class FileMapper {
  private readonly filePath: string;
  private mappings: FileMapping[] = [];

  constructor(customPath?: string) {
    this.filePath = customPath || getMappingsFilePath();
    this.load();
  }

  load(): void {
    if (!fs.existsSync(this.filePath)) {
      this.mappings = [];
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.mappings = Array.isArray(parsed) ? (parsed as FileMapping[]) : [];
    } catch {
      this.mappings = [];
    }
  }

  private save(): void {
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.mappings, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  getAll(): FileMapping[] {
    return [...this.mappings];
  }

  findByLocalPath(localPath: string): FileMapping | undefined {
    const resolved = path.resolve(localPath);
    return this.mappings.find((m) => path.resolve(m.localPath) === resolved);
  }

  findByGoogleFileId(googleFileId: string): FileMapping | undefined {
    return this.mappings.find((m) => m.googleFileId === googleFileId);
  }

  upsert(mapping: FileMapping): void {
    const resolved = path.resolve(mapping.localPath);
    const normalized: FileMapping = { ...mapping, localPath: resolved };
    const idx = this.mappings.findIndex(
      (m) => m.googleFileId === normalized.googleFileId || path.resolve(m.localPath) === resolved
    );
    if (idx >= 0) {
      this.mappings[idx] = normalized;
    } else {
      this.mappings.push(normalized);
    }
    this.save();
  }

  removeByGoogleFileId(googleFileId: string): void {
    this.mappings = this.mappings.filter((m) => m.googleFileId !== googleFileId);
    this.save();
  }
}
