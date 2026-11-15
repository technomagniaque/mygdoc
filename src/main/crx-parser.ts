import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

const CRX_MAGIC = 'Cr24';

/**
 * Extrait le buffer ZIP contenu dans une archive CRX2 ou CRX3.
 */
export function extractZipFromCrx(crxBuffer: Buffer): Buffer {
  if (crxBuffer.length < 16) {
    throw new Error('Fichier CRX invalide : taille insuffisante');
  }

  const magic = crxBuffer.subarray(0, 4).toString('ascii');
  if (magic !== CRX_MAGIC) {
    throw new Error(`Signature CRX invalide : ${magic}`);
  }

  const version = crxBuffer.readUInt32LE(4);
  let zipOffset: number;

  if (version === 3) {
    const headerSize = crxBuffer.readUInt32LE(8);
    zipOffset = 12 + headerSize;
  } else if (version === 2) {
    const pubKeyLength = crxBuffer.readUInt32LE(8);
    const sigLength = crxBuffer.readUInt32LE(12);
    zipOffset = 16 + pubKeyLength + sigLength;
  } else {
    throw new Error(`Version CRX non supportée : ${version}`);
  }

  if (zipOffset >= crxBuffer.length) {
    throw new Error('Offset ZIP hors limites dans le fichier CRX');
  }

  const zipBuffer = crxBuffer.subarray(zipOffset);
  if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
    throw new Error('Contenu ZIP invalide après en-tête CRX');
  }

  return zipBuffer;
}

/**
 * Décompresse une archive CRX3/CRX2 vers un répertoire cible.
 */
export function unpackCrxToDir(crxBuffer: Buffer, targetDir: string): void {
  const zipBuffer = extractZipFromCrx(crxBuffer);
  const tempDir = `${targetDir}.tmp-${Date.now()}`;

  fs.mkdirSync(tempDir, { recursive: true });
  try {
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    const manifestPath = path.join(tempDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json introuvable après extraction CRX');
    }

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.renameSync(tempDir, targetDir);
  } catch (err) {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw err;
  }
}
