import { v5 as uuidv5 } from 'uuid';

// Deliberately independent of SheetJS and the potentially large cell manifest.
const SCHEMA = 'motil.workbook-evidence.v1';
const NAMESPACE = uuidv5(SCHEMA, uuidv5.URL);

export function workbookEvidenceDocumentId(organizationId: string, sha256: string, previousVersionId: string | null = null): string {
  return uuidv5(JSON.stringify([organizationId, sha256, previousVersionId]), NAMESPACE);
}

export function workbookEvidenceStoragePath(organizationId: string, id: string, extension: 'xlsx' | 'xls'): string {
  return `${organizationId}/maintenance/source-workbooks/${id}/original.${extension}`;
}

export type WorkbookEvidenceIdentityRow = {
  id: string;
  organization_id: string;
  module: string;
  category: string | null;
  canonical_section: string | null;
  canonical_role: string | null;
  provenance_status: string | null;
  previous_version_id: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  extraction_schema: unknown;
  manifest_schema: unknown;
  extraction_file: unknown;
  extraction_counts: unknown;
};

export type VerifiedWorkbookEvidenceIdentity = {
  file: { name: string; extension: 'xlsx' | 'xls'; byteLength: number; sha256: string };
  counts: { sheets: number; cells: number; formulaCells: number };
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Generic document uploads accept free-form extracted_data. Schema text alone
 * cannot establish provenance. Require the server ingest's immutable identity,
 * content-bound object path and file size as well as its supporting-source role.
 */
export function verifiedWorkbookEvidenceIdentity(row: WorkbookEvidenceIdentityRow): VerifiedWorkbookEvidenceIdentity | null {
  if (row.module !== 'mantenimiento' || row.category !== 'source-workbooks' || row.canonical_section !== 'library'
      || row.canonical_role !== 'supporting' || row.provenance_status !== 'supporting'
      || row.extraction_schema !== SCHEMA || row.manifest_schema !== SCHEMA) return null;
  const file = record(row.extraction_file);
  const counts = record(row.extraction_counts);
  if (!file || !counts || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255
      || !['xlsx', 'xls'].includes(String(file.extension)) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.byteLength) || Number(file.byteLength) <= 0 || row.file_size_bytes !== file.byteLength) return null;
  const expectedId = workbookEvidenceDocumentId(row.organization_id, file.sha256, row.previous_version_id);
  if (row.id !== expectedId || row.file_path !== workbookEvidenceStoragePath(row.organization_id, expectedId, file.extension as 'xlsx' | 'xls')) return null;
  if (![counts.sheets, counts.cells, counts.formulaCells].every(value => Number.isSafeInteger(value) && Number(value) >= 0)
      || Number(counts.sheets) < 1 || Number(counts.formulaCells) > Number(counts.cells)) return null;
  return {
    file: { name: file.name, extension: file.extension as 'xlsx' | 'xls', byteLength: Number(file.byteLength), sha256: file.sha256 },
    counts: { sheets: Number(counts.sheets), cells: Number(counts.cells), formulaCells: Number(counts.formulaCells) },
  };
}
