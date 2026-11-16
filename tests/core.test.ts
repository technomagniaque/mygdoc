import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { extractZipFromCrx, unpackCrxToDir } from '../src/main/crx-parser';
import { FileMapper, inferExportFormat } from '../src/main/file-mapper';
import {
  buildCleanChromeUserAgent,
  buildGoogleChromeFullVersionList,
  buildGoogleChromeSecChUa,
  isGoogleAuthUrl,
} from '../src/main/ua-helpers';

test('extractZipFromCrx extrait correctement le ZIP d’une archive CRX3', () => {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ name: 'Test', version: '1.0' })));
  const zipBuf = zip.toBuffer();

  const headerProto = Buffer.from([0x0a, 0x02, 0x01, 0x02]);
  const crxHeader = Buffer.alloc(12);
  crxHeader.write('Cr24', 0, 'ascii');
  crxHeader.writeUInt32LE(3, 4);
  crxHeader.writeUInt32LE(headerProto.length, 8);

  const crxBuffer = Buffer.concat([crxHeader, headerProto, zipBuf]);
  const extracted = extractZipFromCrx(crxBuffer);

  assert.equal(extracted.equals(zipBuf), true);
});

test('extractZipFromCrx rejette une signature invalide', () => {
  assert.throws(() => extractZipFromCrx(Buffer.from('NOPE1234567890123456')), /Signature CRX invalide/);
});

test('unpackCrxToDir décompresse manifest.json dans le dossier cible', () => {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ name: 'Offline', version: '1.83.1' })));
  const zipBuf = zip.toBuffer();

  const crxHeader = Buffer.alloc(12);
  crxHeader.write('Cr24', 0, 'ascii');
  crxHeader.writeUInt32LE(3, 4);
  crxHeader.writeUInt32LE(0, 8);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gdocs-crx-test-'));
  const targetDir = path.join(tmpRoot, 'ext');

  try {
    unpackCrxToDir(Buffer.concat([crxHeader, zipBuf]), targetDir);
    const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.version, '1.83.1');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('FileMapper persiste et retrouve les associations local <-> Google', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdocs-map-test-'));
  const mapPath = path.join(tmpDir, 'mappings.json');

  try {
    const mapper = new FileMapper(mapPath);
    mapper.upsert({
      localPath: '/tmp/mon-doc.docx',
      googleFileId: '1AbCdEf',
      lastSyncHash: 'abc123',
      lastRemoteModifiedTime: '2026-11-15T12:00:00Z',
      autoExportFormat: 'docx',
      title: 'mon-doc',
    });

    const reloaded = new FileMapper(mapPath);
    const byId = reloaded.findByGoogleFileId('1AbCdEf');
    const byPath = reloaded.findByLocalPath('/tmp/mon-doc.docx');

    assert.ok(byId);
    assert.equal(byId.title, 'mon-doc');
    assert.equal(byPath?.googleFileId, '1AbCdEf');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('inferExportFormat détecte les formats supportés', () => {
  assert.equal(inferExportFormat('/home/eti/notes.docx'), 'docx');
  assert.equal(inferExportFormat('/home/eti/notes.odt'), 'odt');
  assert.equal(inferExportFormat('/home/eti/notes.md'), 'md');
  assert.equal(inferExportFormat('/home/eti/notes.txt'), 'txt');
});

test('buildGoogleChromeSecChUa et FullVersionList incluent Google Chrome de façon cohérente', () => {
  assert.equal(
    buildGoogleChromeSecChUa('134.0.6998.205'),
    '"Not:A-Brand";v="24", "Chromium";v="134", "Google Chrome";v="134"'
  );
  assert.equal(
    buildGoogleChromeFullVersionList('134.0.6998.205'),
    '"Not:A-Brand";v="24.0.0.0", "Chromium";v="134.0.6998.205", "Google Chrome";v="134.0.6998.205"'
  );
  assert.equal(
    buildCleanChromeUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/134.0.6998.205 mygdoc/1.0.0 Electron/35.1.5 Safari/537.36'
    ),
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/134.0.6998.205 Safari/537.36'
  );
});

test('isGoogleAuthUrl détecte uniquement les hôtes d’authentification Google', () => {
  assert.equal(isGoogleAuthUrl('https://accounts.google.com/v3/signin/rejected?service=wise'), true);
  assert.equal(isGoogleAuthUrl('https://sub.accounts.google.com/ServiceLogin'), true);
  assert.equal(isGoogleAuthUrl('https://accounts.youtube.com/accounts/SetSID'), true);
  assert.equal(isGoogleAuthUrl('https://docs.google.com/document/d/123/edit'), false);
  assert.equal(isGoogleAuthUrl('not-a-url'), false);
});
