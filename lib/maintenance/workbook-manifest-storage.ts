import { gzipSync, gunzipSync } from 'node:zlib';
import { TextDecoder } from 'node:util';
import {
  WORKBOOK_EVIDENCE_LIMITS, WORKBOOK_EVIDENCE_SCHEMA_VERSION,
  WorkbookEvidenceError, workbookBytesSha256,
  type WorkbookEvidenceCounts, type WorkbookEvidenceManifest,
} from '@/lib/maintenance/workbook-evidence';

// Server-side storage for the complete evidence. Database projections retain
// only its summary and this descriptor; they never need to expand the cells.
export const WORKBOOK_MANIFEST_BUCKET = 'maintenance-workbook-manifests';
export const WORKBOOK_MANIFEST_REPRESENTATION = 'storage-gzip-v1';
export const WORKBOOK_MANIFEST_MAX_GZIP_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BYTES = WORKBOOK_EVIDENCE_LIMITS.maxManifestBytes;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNT_KEYS: Array<keyof WorkbookEvidenceCounts> = [
  'sheets', 'hiddenSheets', 'cells', 'formulaCells', 'cachedFormulaCells',
  'mergedRanges', 'definedNames', 'dependencies',
];

export type WorkbookManifestStorageDescriptor = {
  version: 1;
  bucket: typeof WORKBOOK_MANIFEST_BUCKET;
  path: string;
  encoding: 'gzip';
  jsonSha256: string;
  jsonByteLength: number;
  gzipSha256: string;
  gzipByteLength: number;
};
export type WorkbookManifestSummary = Pick<WorkbookEvidenceManifest,
  'schemaVersion' | 'file' | 'parser' | 'dateSystem' | 'counts' | 'fidelity'>;
export type WorkbookManifestReadContext = {
  organizationId: string;
  documentId: string;
  file: WorkbookEvidenceManifest['file'];
  counts: unknown;
};

function invalid(): never {
  throw new WorkbookEvidenceError('STORED_MANIFEST_INVALID', 'El manifiesto guardado no supera la verificación de integridad. Requiere revisión antes de reutilizarse.', 409);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function boundedLength(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= maximum;
}

export function workbookManifestStoragePath(organizationId: string, documentId: string, jsonSha256: string): string {
  if (!UUID.test(organizationId) || !UUID.test(documentId) || !SHA256.test(jsonSha256)) invalid();
  return `${organizationId}/maintenance/source-workbooks/${documentId}/manifests/${jsonSha256}.json.gz`;
}

export function workbookManifestSummary(manifest: WorkbookEvidenceManifest): WorkbookManifestSummary {
  const { schemaVersion, file, parser, dateSystem, counts, fidelity } = manifest;
  return { schemaVersion, file: { ...file }, parser: { ...parser }, dateSystem, counts: { ...counts }, fidelity: { ...fidelity } };
}

export function createWorkbookManifestArtifact(manifest: WorkbookEvidenceManifest, organizationId: string, documentId: string) {
  const json = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (json.length > MAX_JSON_BYTES) {
    throw new WorkbookEvidenceError('MANIFEST_STORAGE_LIMIT_EXCEEDED', 'El manifiesto completo supera el límite de 32 MiB. No se ha guardado ni recortado el archivo.', 413);
  }
  const bytes = gzipSync(json);
  if (bytes.length > WORKBOOK_MANIFEST_MAX_GZIP_BYTES) {
    throw new WorkbookEvidenceError('MANIFEST_STORAGE_LIMIT_EXCEEDED', 'El manifiesto completo supera el límite comprimido de 3 MiB. No se ha guardado ni recortado el archivo.', 413);
  }
  const jsonSha256 = workbookBytesSha256(json);
  const descriptor: WorkbookManifestStorageDescriptor = {
    version: 1, bucket: WORKBOOK_MANIFEST_BUCKET,
    path: workbookManifestStoragePath(organizationId, documentId, jsonSha256), encoding: 'gzip',
    jsonSha256, jsonByteLength: json.length,
    gzipSha256: workbookBytesSha256(bytes), gzipByteLength: bytes.length,
  };
  return { bytes, descriptor, summary: workbookManifestSummary(manifest) };
}

export function parseWorkbookManifestStorage(value: unknown, organizationId: string, documentId: string): WorkbookManifestStorageDescriptor {
  const source = record(value);
  if (!source || source.version !== 1 || source.bucket !== WORKBOOK_MANIFEST_BUCKET || source.encoding !== 'gzip'
      || typeof source.jsonSha256 !== 'string' || !SHA256.test(source.jsonSha256)
      || typeof source.gzipSha256 !== 'string' || !SHA256.test(source.gzipSha256)
      || !boundedLength(source.jsonByteLength, MAX_JSON_BYTES)
      || !boundedLength(source.gzipByteLength, WORKBOOK_MANIFEST_MAX_GZIP_BYTES)
      || source.path !== workbookManifestStoragePath(organizationId, documentId, source.jsonSha256)) invalid();
  return {
    version: 1, bucket: WORKBOOK_MANIFEST_BUCKET, path: source.path as string, encoding: 'gzip',
    jsonSha256: source.jsonSha256, jsonByteLength: source.jsonByteLength,
    gzipSha256: source.gzipSha256, gzipByteLength: source.gzipByteLength,
  };
}

function validateManifest(value: unknown, context: WorkbookManifestReadContext): WorkbookEvidenceManifest {
  const manifest = record(value);
  const file = record(manifest?.file);
  const counts = record(manifest?.counts);
  const expectedCounts = record(context.counts);
  const parser = record(manifest?.parser);
  const fidelity = record(manifest?.fidelity);
  if (!manifest || manifest.schemaVersion !== WORKBOOK_EVIDENCE_SCHEMA_VERSION || !file || !counts || !expectedCounts
      || !parser || parser.name !== 'SheetJS' || typeof parser.version !== 'string'
      || (manifest.dateSystem !== '1900' && manifest.dateSystem !== '1904')
      || fidelity?.formulasCalculated !== false || fidelity?.dependencies !== 'lexical-evidence' || fidelity?.originalIsAuthority !== true
      || !Array.isArray(manifest.sheets) || !Array.isArray(manifest.definedNames)
      || !Array.isArray(manifest.warnings) || !manifest.warnings.every(warning => typeof warning === 'string')) invalid();
  for (const key of ['name', 'extension', 'byteLength', 'sha256'] as const) {
    if (file[key] !== context.file[key]) invalid();
  }
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || Number(counts[key]) < 0 || counts[key] !== expectedCounts[key]) invalid();
  }
  if (!manifest.sheets.length || manifest.sheets.length > WORKBOOK_EVIDENCE_LIMITS.maxSheets
      || Number(counts.cells) > WORKBOOK_EVIDENCE_LIMITS.maxCells) invalid();

  // Recount the structures, not just the declared totals. This rejects a
  // partial manifest that retained an unchanged summary after losing cells.
  const actual: WorkbookEvidenceCounts = {
    sheets: manifest.sheets.length, hiddenSheets: 0, cells: 0, formulaCells: 0,
    cachedFormulaCells: 0, mergedRanges: 0, definedNames: manifest.definedNames.length, dependencies: 0,
  };
  for (let index = 0; index < manifest.sheets.length; index++) {
    const sheet = record(manifest.sheets[index]);
    if (!sheet || sheet.index !== index || typeof sheet.name !== 'string'
        || typeof sheet.visibility !== 'string' || !['visible', 'hidden', 'veryHidden'].includes(sheet.visibility)
        || !Array.isArray(sheet.cells) || !Array.isArray(sheet.mergedRanges)
        || !sheet.mergedRanges.every(range => typeof range === 'string')) invalid();
    actual.hiddenSheets += sheet.visibility === 'visible' ? 0 : 1;
    actual.cells += sheet.cells.length;
    actual.mergedRanges += sheet.mergedRanges.length;
    for (const sourceCell of sheet.cells) {
      const cell = record(sourceCell);
      if (!cell || typeof cell.address !== 'string' || !Array.isArray(cell.dependencies)
          || (cell.formula !== null && typeof cell.formula !== 'string')
          || (cell.arrayFormulaRange !== null && typeof cell.arrayFormulaRange !== 'string')
          || typeof cell.hasCachedValue !== 'boolean') invalid();
      const formula = cell.formula !== null || cell.arrayFormulaRange !== null;
      actual.formulaCells += formula ? 1 : 0;
      actual.cachedFormulaCells += formula && cell.hasCachedValue ? 1 : 0;
      actual.dependencies += cell.dependencies.length;
    }
  }
  for (const sourceName of manifest.definedNames) {
    const name = record(sourceName);
    if (!name || !Array.isArray(name.dependencies)) invalid();
    actual.dependencies += name.dependencies.length;
  }
  for (const key of COUNT_KEYS) if (counts[key] !== actual[key]) invalid();
  return manifest as unknown as WorkbookEvidenceManifest;
}

export function decodeWorkbookManifestArtifact(bytes: Uint8Array, descriptorValue: unknown, context: WorkbookManifestReadContext): WorkbookEvidenceManifest {
  const descriptor = parseWorkbookManifestStorage(descriptorValue, context.organizationId, context.documentId);
  if (bytes.length > WORKBOOK_MANIFEST_MAX_GZIP_BYTES || bytes.length !== descriptor.gzipByteLength
      || workbookBytesSha256(bytes) !== descriptor.gzipSha256) invalid();
  let json: Buffer;
  try {
    // Keep zlib's default final integrity checks. The bound applies during
    // inflation, before allocating an arbitrarily large decoded result.
    json = gunzipSync(bytes, { maxOutputLength: MAX_JSON_BYTES });
  } catch { invalid(); }
  if (json.length !== descriptor.jsonByteLength || workbookBytesSha256(json) !== descriptor.jsonSha256) invalid();
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)); }
  catch { invalid(); }
  return validateManifest(value, context);
}
