import { isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';
import { verifiedWorkbookEvidenceIdentity } from '@/lib/maintenance/workbook-evidence-identity';

/** Read-only projections of source records. A source is never an approved plan. */
export type SourceEvidenceType = 'planning_import' | 'module_document' | 'whatsapp_attachment';
export type SourceEvidenceReviewStatus = 'pending' | 'approved' | 'rejected' | 'unknown';
export type SourceEvidenceExtractionStatus = 'not_started' | 'processing' | 'extracted' | 'partial' | 'manual_required' | 'unknown';

export type SourceEvidenceRecord = {
  id: string;
  sourceId: string;
  sourceType: SourceEvidenceType;
  fileName: string;
  documentType: string | null;
  version: string | null;
  previousVersionId: string | null;
  receivedAt: string | null;
  receivedAtKind: 'received' | 'uploaded' | 'imported' | 'registered';
  sender: { name: string | null; id: string | null; role: string | null } | null;
  reviewer: { name: string | null; id: string; reviewedAt: string } | null;
  integrity: {
    kind: 'binary_sha256' | 'metadata_fingerprint' | 'unverified' | 'unknown';
    value: string | null;
    label: string;
  };
  extraction: { status: SourceEvidenceExtractionStatus; label: string };
  review: { status: SourceEvidenceReviewStatus; label: string };
  applicability: { status: 'unverified' | 'linked'; label: string };
  original: { status: 'available' | 'missing'; url: string | null; reason: string | null };
  locator: { kind: 'import' | 'document' | 'message'; sheet: string | null; label: string; messageId: string | null };
  family: string | null;
  interval: { value: number | null; unit: string | null; text: string | null } | null;
  workbookEvidence: { eligiblePreviousVersion: boolean; sheets: number; cells: number; formulaCells: number } | null;
  notes: string[];
};

export type SourceEvidenceAvailability = {
  status: 'available' | 'truncated' | 'unavailable';
  returned: number;
  total: number | null;
  reason: string | null;
};

export type SourceEvidenceResponse = {
  data: SourceEvidenceRecord[];
  summary: { loaded: number; matched: number; originalsAvailable: number; pendingReview: number; unknownApplicability: number };
  availability: {
    status: 'complete' | 'partial' | 'unavailable';
    limitPerSource: number;
    sources: Record<SourceEvidenceType, SourceEvidenceAvailability>;
    warnings: string[];
  };
  filters: { q: string; sourceType: SourceEvidenceType | null; review: SourceEvidenceReviewStatus | null };
};

export type PlanningEvidenceRow = {
  id: string;
  organization_id: string;
  source_file: string | null;
  source_file_sha256: string | null;
  source_owner: string | null;
  source_role: string | null;
  source_sheet: string | null;
  imported_at: string | null;
  status: string | null;
  notes: string | null;
};

export type ModuleDocumentEvidenceRow = {
  id: string;
  organization_id: string;
  module: string;
  category: string | null;
  canonical_role: string | null;
  provenance_status: string | null;
  document_name: string | null;
  document_type: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  version: number | string | null;
  previous_version_id: string | null;
  created_at: string | null;
  uploaded_by: string | null;
  status: string | null;
  is_active: boolean;
  deleted_at: string | null;
  asset_id: string | null;
  canonical_section: string | null;
  l1_status: string | null;
  l2_status: string | null;
  reviewed_by_l1: string | null;
  reviewed_by_l2: string | null;
  reviewed_at_l1: string | null;
  reviewed_at_l2: string | null;
  extraction_schema: unknown;
  manifest_schema: unknown;
  extraction_file: unknown;
  extraction_counts: unknown;
  extraction_state: unknown;
  extraction_partial: unknown;
};

export type WhatsappEvidenceRow = {
  id: string;
  organization_id: string;
  group_id: string;
  message_id: number | string;
  original_file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  storage_path: string | null;
  download_status: string;
  scan_status: string;
  extraction_partial: unknown;
  created_at: string | null;
};

export type WhatsappEvidenceMessage = {
  id: number | string;
  organization_id: string;
  group_id: string;
  sender_name: string | null;
  file_name: string | null;
  occurred_at: string | null;
  received_at: string | null;
};

export type SourceEvidenceGroup = {
  id: string;
  organization_id: string;
  chat_id: string;
  display_name: string;
  enabled: boolean;
};

export const SOURCE_EVIDENCE_TYPES: SourceEvidenceType[] = ['planning_import', 'module_document', 'whatsapp_attachment'];
export const SOURCE_EVIDENCE_REVIEW_STATUSES: SourceEvidenceReviewStatus[] = ['pending', 'approved', 'rejected', 'unknown'];
export const SOURCE_EVIDENCE_LIMIT = 200;
export const SOURCE_EVIDENCE_NO_STORE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export const SOURCE_EVIDENCE_UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

/** An empty allowlist grants no WhatsApp access; group names never grant it. */
export function configuredMaintenanceSourceGroups(value: string | undefined): string[] | null {
  if (!value?.trim()) return [];
  const ids = [...new Set(value.split(',').map(id => id.trim()))];
  return ids.length <= 50 && ids.every(id => SOURCE_EVIDENCE_UUID.test(id)) ? ids : null;
}

export function permittedMaintenanceSourceGroup(group: SourceEvidenceGroup, organizationId: string, allowedIds: string[]): boolean {
  return group.organization_id === organizationId && group.enabled === true && allowedIds.includes(group.id)
    && !isExcludedMotilWhatsappGroup(group.chat_id);
}

function text(value: unknown, max = 600): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, max) || null;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validHash(value: unknown): string | null {
  const hash = text(value, 65);
  return hash && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
}

function unknownApplicability(): SourceEvidenceRecord['applicability'] {
  return { status: 'unverified', label: 'Aplicabilidad técnica no acreditada' };
}

function original(sourceType: SourceEvidenceType, id: string, available: boolean, reason: string): SourceEvidenceRecord['original'] {
  return {
    status: available ? 'available' : 'missing',
    url: available ? `/api/maintenance/source-evidence/${sourceType}/${encodeURIComponent(id)}/origin` : null,
    reason: available ? null : reason,
  };
}

/** Paths are database records, never client-supplied URLs or bucket names. */
export function sourceEvidenceStoragePath(sourceType: SourceEvidenceType, path: unknown, organizationId: string): string | null {
  const value = text(path, 2048);
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('://') || /[\u0000-\u001f\u007f?#%]/.test(value)) return null;
  if (value.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  if (sourceType === 'whatsapp_attachment') return value.startsWith(`${organizationId}/`) ? value : null;
  if (sourceType === 'module_document') {
    // Existing module uploads use this legacy prefix; newer tenant-prefixed
    // objects are accepted only for the authenticated organization.
    return value.startsWith('mantenimiento/') || value.startsWith('maintenance/') || value.startsWith(`${organizationId}/`) ? value : null;
  }
  return null;
}

export function projectPlanningEvidence(row: PlanningEvidenceRow): SourceEvidenceRecord {
  const hash = validHash(row.source_file_sha256);
  return {
    id: `planning_import:${row.id}`, sourceId: row.id, sourceType: 'planning_import',
    fileName: text(row.source_file, 255) || 'Importación sin nombre de archivo',
    documentType: null, version: null, previousVersionId: null,
    receivedAt: text(row.imported_at), receivedAtKind: 'imported',
    sender: text(row.source_owner) ? { name: text(row.source_owner), id: null, role: text(row.source_role) } : null,
    reviewer: null,
    // A column name does not prove that the digest was computed over bytes.
    // Some historic imports instead hashed source metadata. No such claim is
    // upgraded without explicit provenance or access to the native original.
    integrity: { kind: hash ? 'unverified' : 'unknown', value: hash, label: hash ? 'Hash registrado; integridad del original sin verificar' : 'Sin hash verificable del original' },
    extraction: { status: 'partial', label: 'Importación tabular registrada; cobertura del libro no acreditada' },
    review: row.status === 'review_required'
      ? { status: 'pending', label: 'Importación pendiente de revisión' }
      : { status: 'unknown', label: 'Revisión documental no acreditada por el estado de importación' },
    applicability: unknownApplicability(),
    original: original('planning_import', row.id, false, 'La importación no registra un archivo original accesible.'),
    locator: { kind: 'import', sheet: text(row.source_sheet), label: 'Referencia de importación; filas y celdas del original no verificadas', messageId: null },
    family: null, interval: null, workbookEvidence: null,
    notes: [text(row.notes), 'El estado de importación no aprueba reglas, intervalos ni planes de mantenimiento.'].filter((note): note is string => Boolean(note)),
  };
}

function documentReview(row: ModuleDocumentEvidenceRow): Pick<SourceEvidenceRecord, 'review' | 'reviewer'> {
  const candidates = [
    { level: 'L1', status: row.l1_status, id: row.reviewed_by_l1, at: row.reviewed_at_l1 },
    { level: 'L2', status: row.l2_status, id: row.reviewed_by_l2, at: row.reviewed_at_l2 },
  ].filter(item => item.id && item.at && Number.isFinite(Date.parse(item.at)) && ['approved', 'rejected'].includes(item.status || ''))
    .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!) || (a.level === 'L2' ? -1 : 1));
  const last = candidates[0];
  if (last) {
    const status: SourceEvidenceReviewStatus = last.status === 'rejected' ? 'rejected' : last.level === 'L2' ? 'approved' : 'pending';
    return {
      review: { status, label: last.status === 'rejected' ? `Rechazo documental ${last.level} registrado` : last.level === 'L2' ? 'Revisión documental L2 registrada' : 'Revisión L1 registrada; aprobación L2 pendiente' },
      reviewer: { id: last.id!, name: null, reviewedAt: last.at! },
    };
  }
  return {
    review: ['draft', 'pending_l1', 'pending_l2', 'under_review_l1', 'under_review_l2'].includes(row.status || '')
      ? { status: 'pending', label: 'Revisión documental pendiente' }
      : { status: 'unknown', label: 'Sin revisión documental con responsable y fecha' },
    reviewer: null,
  };
}

function extractionFromData(value: unknown, emptyStatus: SourceEvidenceExtractionStatus): SourceEvidenceRecord['extraction'] {
  const data = object(value);
  if (!Object.keys(data).length) return { status: emptyStatus, label: emptyStatus === 'not_started' ? 'Sin extracción registrada' : 'Cobertura de extracción desconocida' };
  const coverage = text(data.coverage) || text(data.completeness) || text(data.status);
  if (coverage === 'partial_due_to_limits' || data.partial_due_to_limits === true || data.truncated === true || data.complete === false)
    return { status: 'partial', label: 'Extracción parcial; revisar omisiones en el original' };
  // Presence of structured output is not a completeness certificate.
  return { status: 'extracted', label: 'Extracción registrada; completitud no verificada' };
}

export function projectModuleDocumentEvidence(row: ModuleDocumentEvidenceRow): SourceEvidenceRecord {
  const path = sourceEvidenceStoragePath('module_document', row.file_path, row.organization_id);
  const review = documentReview(row);
  const workbook = verifiedWorkbookEvidenceIdentity(row);
  return {
    id: `module_document:${row.id}`, sourceId: row.id, sourceType: 'module_document',
    fileName: workbook?.file.name || text(row.document_name, 255) || 'Documento sin nombre', documentType: text(row.document_type),
    version: row.version !== null && row.version !== undefined ? String(row.version).slice(0, 80) : null,
    previousVersionId: text(row.previous_version_id),
    receivedAt: text(row.created_at), receivedAtKind: 'uploaded',
    sender: row.uploaded_by ? { id: row.uploaded_by, name: null, role: 'Persona que cargó el documento' } : null,
    ...review,
    integrity: workbook
      ? { kind: 'binary_sha256', value: workbook.file.sha256, label: 'SHA256 de los bytes recibidos por la importación documental' }
      : { kind: 'unknown', value: null, label: 'Sin hash binario acreditado en el registro documental' },
    extraction: workbook
      ? { status: 'extracted', label: `Extracción estructurada: ${workbook.counts.sheets} hojas, ${workbook.counts.cells} celdas y ${workbook.counts.formulaCells} fórmulas conservadas sin recalcular` }
      : row.extraction_state || row.extraction_partial === true || row.extraction_partial === 'true'
        ? extractionFromData({ status: row.extraction_state, partial_due_to_limits: row.extraction_partial === true || row.extraction_partial === 'true' }, 'unknown')
        : { status: 'unknown', label: 'Cobertura de extracción desconocida' },
    applicability: row.asset_id
      ? { status: 'linked', label: 'Vínculo a equipo registrado; aplicabilidad técnica pendiente de acreditar' }
      : unknownApplicability(),
    original: original('module_document', row.id, Boolean(path), 'El registro no contiene una ruta válida al original privado.'),
    locator: { kind: 'document', sheet: null, label: workbook ? 'Manifiesto nativo con referencias por hoja y celda' : text(row.canonical_section) || 'Documento completo; fragmentos aún no localizados', messageId: null },
    family: null, interval: null,
    workbookEvidence: workbook ? {
      ...workbook.counts,
      eligiblePreviousVersion: row.is_active === true && row.deleted_at === null
        && typeof row.version === 'number' && Number.isInteger(row.version) && row.version >= 1 && row.version < 2147483647,
    } : null,
    notes: [
      'La revisión documental no aprueba por sí sola la aplicabilidad de una pauta.',
      ...(row.is_active === false ? ['Versión documental histórica o inactiva.'] : []),
    ],
  };
}

export function projectWhatsappEvidence(row: WhatsappEvidenceRow, message: WhatsappEvidenceMessage): SourceEvidenceRecord {
  const hash = validHash(row.sha256);
  const path = sourceEvidenceStoragePath('whatsapp_attachment', row.storage_path, row.organization_id);
  let extraction: SourceEvidenceRecord['extraction'];
  if (row.scan_status === 'manual') extraction = { status: 'manual_required', label: 'Lectura manual pendiente' };
  else if (['processing', 'pending', 'retry'].includes(row.scan_status)) extraction = { status: 'processing', label: 'Extracción pendiente o en proceso' };
  else if (row.scan_status === 'review_ready') extraction = extractionFromData({ partial_due_to_limits: row.extraction_partial === true || row.extraction_partial === 'true' }, 'unknown');
  else extraction = { status: 'not_started', label: 'Sin extracción registrada' };
  return {
    id: `whatsapp_attachment:${row.id}`, sourceId: row.id, sourceType: 'whatsapp_attachment',
    fileName: text(row.original_file_name, 255) || text(message.file_name, 255) || 'Adjunto sin nombre',
    documentType: text(row.mime_type), version: null, previousVersionId: null,
    receivedAt: text(message.received_at) || text(row.created_at), receivedAtKind: message.received_at ? 'received' : 'registered',
    sender: text(message.sender_name) ? { name: text(message.sender_name), id: null, role: 'Remitente del mensaje' } : null,
    reviewer: null,
    integrity: { kind: hash && row.download_status === 'stored' ? 'binary_sha256' : hash ? 'unverified' : 'unknown', value: hash,
      label: hash && row.download_status === 'stored' ? 'SHA256 del archivo descargado' : hash ? 'Hash registrado; archivo no disponible para cotejo' : 'Sin hash binario registrado' },
    extraction,
    // Review-ready is an extraction queue state, never a human approval.
    review: { status: 'pending', label: 'Revisión documental pendiente' },
    applicability: unknownApplicability(),
    original: original('whatsapp_attachment', row.id, row.download_status === 'stored' && Boolean(path), 'El original aún no está disponible en el repositorio privado.'),
    locator: { kind: 'message', sheet: null, label: 'Adjunto enlazado a su mensaje de origen', messageId: String(message.id) },
    family: null, interval: null, workbookEvidence: null,
    notes: ['La extracción automática y el nombre del archivo no confirman unidad, vigencia ni aplicabilidad.'],
  };
}

export function filterSourceEvidence(records: SourceEvidenceRecord[], filters: SourceEvidenceResponse['filters']): SourceEvidenceRecord[] {
  const query = filters.q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
  return records.filter(record => {
    if (filters.sourceType && record.sourceType !== filters.sourceType) return false;
    if (filters.review && record.review.status !== filters.review) return false;
    const haystack = [record.fileName, record.sender?.name, record.version].filter(Boolean).join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
    return !query || haystack.includes(query);
  });
}
