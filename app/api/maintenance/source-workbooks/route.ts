import { NextRequest, NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getOrganizationContext, hasMaintenanceWriteRole, type OrganizationSuccessContext } from '@/lib/api/organization-context';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { sourceEvidenceStoragePath } from '@/lib/maintenance/source-evidence';
import { workbookEvidenceDocumentId, workbookEvidenceStoragePath, verifiedWorkbookEvidenceIdentity, type WorkbookEvidenceIdentityRow } from '@/lib/maintenance/workbook-evidence-identity';
import {
  WORKBOOK_MANIFEST_BUCKET, WORKBOOK_MANIFEST_REPRESENTATION, WORKBOOK_MANIFEST_MAX_GZIP_BYTES,
  createWorkbookManifestArtifact, decodeWorkbookManifestArtifact, parseWorkbookManifestStorage,
  type WorkbookManifestStorageDescriptor,
} from '@/lib/maintenance/workbook-manifest-storage';
import {
  parseWorkbookEvidence, workbookBytesSha256, WorkbookEvidenceError,
  WORKBOOK_EVIDENCE_SCHEMA_VERSION, WORKBOOK_EVIDENCE_LIMITS, WORKBOOK_UPLOAD_MAX_BYTES,
  type WorkbookEvidenceCapabilities, type WorkbookEvidenceManifest, type WorkbookEvidenceResponse,
} from '@/lib/maintenance/workbook-evidence';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'module-documents';
const MODULE = 'mantenimiento';
const CATEGORY = 'source-workbooks';
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_DOCUMENT_PAYLOAD_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOCUMENT_COLUMNS = 'id,organization_id,module,category,canonical_section,canonical_role,provenance_status,document_name,file_path,file_size_bytes,status,version,previous_version_id,is_active,deleted_at,extraction_schema:extracted_data->>schemaVersion,manifest_schema:extracted_data->manifest->>schemaVersion,extraction_file:extracted_data->manifest->file,extraction_counts:extracted_data->manifest->counts,manifest_representation:extracted_data->>manifestRepresentation,manifest_storage:extracted_data->manifestStorage';
const HEADERS = { 'Cache-Control': 'private, no-store', 'Vary': 'Accept-Encoding', 'X-Content-Type-Options': 'nosniff' };
type Database = ReturnType<typeof getSupabaseServerClient>;
type DocumentRow = WorkbookEvidenceIdentityRow & {
  id: string; document_name: string; file_path: string; file_size_bytes: number | null;
  status: string; version: number; previous_version_id: string | null; is_active: boolean;
  deleted_at: string | null;
  manifest_representation: unknown; manifest_storage: unknown;
};

function backendDiagnostic(stage: string, result: { status?: unknown; error?: unknown }) {
  const error = result.error && typeof result.error === 'object' ? result.error as Record<string, unknown> : {};
  const rawStatus = Number(result.status ?? error.statusCode ?? error.status ?? 0);
  return {
    stage,
    status: Number.isInteger(rawStatus) && rawStatus >= 0 && rawStatus <= 599 ? rawStatus : 0,
    code: typeof error.code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(error.code) ? error.code : 'UNCLASSIFIED',
  };
}

function reportBackendFailure(diagnostic: ReturnType<typeof backendDiagnostic>) {
  // Never log payloads, backend error messages/details, file names or identities.
  console.error('[maintenance/source-workbooks]', diagnostic);
}

function errorResponse(error: unknown) {
  if (error instanceof WorkbookEvidenceError) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code, details: error.details }, { status: error.status, headers: HEADERS });
  }
  return NextResponse.json({ ok: false, error: 'No se pudo procesar la evidencia del libro. Inténtalo nuevamente.', code: 'WORKBOOK_REQUEST_FAILED' }, { status: 500, headers: HEADERS });
}

function acceptsGzip(request: NextRequest) {
  return (request.headers.get('accept-encoding') ?? '').split(',').some((entry) => {
    const [encoding, ...parameters] = entry.trim().toLowerCase().split(';');
    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
    return encoding === 'gzip' && (!quality || Number(quality.trim().slice(2)) > 0);
  });
}

function evidenceResponse(payload: Extract<WorkbookEvidenceResponse, { ok: true }>, request: NextRequest) {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) <= MAX_RESPONSE_BYTES - 4096) {
    return new NextResponse(json, { headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
  }
  if (!acceptsGzip(request)) {
    throw new WorkbookEvidenceError('GZIP_REQUIRED', 'El manifiesto completo requiere una conexión que acepte gzip. Utiliza la vista de biblioteca en un navegador actualizado.', 406);
  }
  const compressed = gzipSync(json);
  // Keep room for small response metadata when a concurrent identical draft is
  // reused. This check always runs before any upload/insert for a new draft.
  if (compressed.length > MAX_RESPONSE_BYTES - 4096) {
    throw new WorkbookEvidenceError('RESPONSE_LIMIT_EXCEEDED', 'El manifiesto completo supera el límite de respuesta incluso comprimido. No se ha guardado ni recortado el archivo.', 413);
  }
  return new NextResponse(new Uint8Array(compressed), { headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip' } });
}

async function boundedRequestBytes(request: NextRequest, maximum: number) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maximum) throw new WorkbookEvidenceError('REQUEST_TOO_LARGE', 'La solicitud supera el límite de carga. El máximo por archivo es 3 MiB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkbookEvidenceError('EMPTY_REQUEST', 'La solicitud no contiene un archivo o referencia.', 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.length;
      if (total > maximum) {
        await reader.cancel();
        throw new WorkbookEvidenceError('REQUEST_TOO_LARGE', 'La solicitud supera el límite de carga. El máximo por archivo es 3 MiB.', 413);
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

async function documentById(database: Database, organizationId: string, id: string, { onlyEvidence = false, includeDeleted = false }: { onlyEvidence?: boolean; includeDeleted?: boolean } = {}) {
  let query = database.from('module_documents').select(DOCUMENT_COLUMNS)
    .eq('organization_id', organizationId).eq('id', id);
  if (!includeDeleted) query = query.is('deleted_at', null);
  query = onlyEvidence ? query.eq('module', MODULE).eq('category', CATEGORY) : query.in('module', [MODULE, 'maintenance']);
  const result = await query.maybeSingle();
  const { data, error } = result;
  if (error) {
    const diagnostic = backendDiagnostic('document_lookup', result);
    reportBackendFailure(diagnostic);
    throw new WorkbookEvidenceError('DOCUMENT_LOOKUP_FAILED', 'No se pudo verificar el documento dentro de tu organización.', 503, diagnostic);
  }
  return data as DocumentRow | null;
}

async function downloadOriginal(database: Database, organizationId: string, path: string, expectedBytes?: number | null) {
  if (!sourceEvidenceStoragePath('module_document', path, organizationId)) throw new WorkbookEvidenceError('INVALID_SOURCE_PATH', 'La referencia del original no es válida para esta organización.', 422);
  if (expectedBytes && expectedBytes > WORKBOOK_EVIDENCE_LIMITS.maxBytes) {
    throw new WorkbookEvidenceError('SOURCE_TOO_LARGE', 'El original supera el límite de lectura de 20 MiB.', 413);
  }
  const { data, error } = await database.storage.from(BUCKET).download(path);
  if (error || !data) throw new WorkbookEvidenceError('ORIGINAL_UNAVAILABLE', 'No se pudo recuperar el archivo original autorizado.', 503);
  if (data.size > WORKBOOK_EVIDENCE_LIMITS.maxBytes) throw new WorkbookEvidenceError('SOURCE_TOO_LARGE', 'El original supera el límite de lectura de 20 MiB.', 413);
  return new Uint8Array(await data.arrayBuffer());
}

function saveDraftCapabilities(canWrite: boolean, role?: string | null): WorkbookEvidenceCapabilities {
  if (!canWrite) return { canSaveDraft: false, reason: 'Tu acceso a mantenimiento es de solo lectura. Puedes examinar el archivo y descargar el manifiesto.' };
  if (!hasMaintenanceWriteRole(role)) return { canSaveDraft: false, reason: 'Tu rol actual no permite guardar borradores de mantenimiento. Puedes examinar el archivo y descargar el manifiesto.' };
  return { canSaveDraft: true, reason: null };
}

function responsePayload(manifest: WorkbookEvidenceManifest, capabilities: WorkbookEvidenceCapabilities, document?: Extract<WorkbookEvidenceResponse, { ok: true }>['document'], reused = false): Extract<WorkbookEvidenceResponse, { ok: true }> {
  return { ok: true, manifest, counts: manifest.counts, warnings: manifest.warnings, capabilities, persisted: Boolean(document), ...(document ? { document, reused } : {}) };
}

function assertDraftNotArchived(row: DocumentRow) {
  if (row.deleted_at !== null) {
    throw new WorkbookEvidenceError('DOCUMENT_ARCHIVED', 'Este original ya pertenece a un documento eliminado de la biblioteca. No se puede crear otro borrador con el mismo archivo y la misma versión anterior.', 409);
  }
}

function reusableDraftIdentity(row: DocumentRow, expected: WorkbookEvidenceManifest, path: string, previousVersionId: string | null) {
  assertDraftNotArchived(row);
  const verified = verifiedWorkbookEvidenceIdentity(row);
  if (!row.is_active || row.status !== 'draft' || row.file_path !== path ||
      row.previous_version_id !== previousVersionId || !verified || verified.file.sha256 !== expected.file.sha256) {
    throw new WorkbookEvidenceError('EXISTING_DOCUMENT_CONFLICT', 'Esta evidencia ya tiene un documento que no puede reutilizarse como borrador. Revísalo en la biblioteca.', 409);
  }
  return verified;
}

function storedManifestDescriptor(row: DocumentRow): WorkbookManifestStorageDescriptor {
  if (row.manifest_representation !== WORKBOOK_MANIFEST_REPRESENTATION) {
    throw new WorkbookEvidenceError('STORED_MANIFEST_INVALID', 'La referencia del manifiesto guardado requiere revisión antes de reutilizarse.', 409);
  }
  return parseWorkbookManifestStorage(row.manifest_storage, row.organization_id, row.id);
}

async function downloadManifestBytes(database: Database, descriptor: WorkbookManifestStorageDescriptor) {
  const result = await database.storage.from(WORKBOOK_MANIFEST_BUCKET).download(descriptor.path);
  if (result.error || !result.data) {
    reportBackendFailure(backendDiagnostic('manifest_download', result));
    throw new WorkbookEvidenceError('STORED_MANIFEST_UNAVAILABLE', 'No se pudo recuperar el manifiesto completo guardado. El original permanece conservado.', 503);
  }
  if (result.data.size > WORKBOOK_MANIFEST_MAX_GZIP_BYTES) {
    throw new WorkbookEvidenceError('STORED_MANIFEST_INVALID', 'El manifiesto guardado supera el límite de lectura. Requiere revisión antes de reutilizarse.', 409);
  }
  return new Uint8Array(await result.data.arrayBuffer());
}

async function preserveManifestArtifact(database: Database, organizationId: string, documentId: string, artifact: ReturnType<typeof createWorkbookManifestArtifact>) {
  const result = await database.storage.from(WORKBOOK_MANIFEST_BUCKET).upload(artifact.descriptor.path, artifact.bytes, {
    contentType: 'application/gzip', cacheControl: '0', upsert: false,
  });
  try {
    // Read back successful writes too. On a collision, accept another gzip
    // encoding only when it expands to the exact same content-addressed JSON.
    const bytes = await downloadManifestBytes(database, artifact.descriptor);
    const descriptor = { ...artifact.descriptor, gzipByteLength: bytes.length, gzipSha256: workbookBytesSha256(bytes) };
    decodeWorkbookManifestArtifact(bytes, descriptor, {
      organizationId, documentId, file: artifact.summary.file, counts: artifact.summary.counts,
    });
    return descriptor;
  } catch (error) {
    if (result.error) reportBackendFailure(backendDiagnostic('manifest_upload', result));
    throw error;
  }
}

async function reuseDraft(database: Database, row: DocumentRow, expected: WorkbookEvidenceManifest, path: string, previousVersionId: string | null, request: NextRequest, capabilities: WorkbookEvidenceCapabilities) {
  reusableDraftIdentity(row, expected, path, previousVersionId);
  const original = await downloadOriginal(database, row.organization_id, path, row.file_size_bytes);
  if (workbookBytesSha256(original) !== expected.file.sha256) {
    throw new WorkbookEvidenceError('ORIGINAL_HASH_MISMATCH', 'El hash del original almacenado no coincide. No se sobrescribió el archivo.', 409);
  }
  if (row.manifest_representation != null || row.manifest_storage != null) {
    const descriptor = storedManifestDescriptor(row);
    const bytes = await downloadManifestBytes(database, descriptor);
    // A deletion or metadata change may race either object download. Resolve
    // the current retained identity before returning a confirmed saved draft.
    const current = await documentById(database, row.organization_id, row.id, { onlyEvidence: true, includeDeleted: true });
    if (!current) throw new WorkbookEvidenceError('STORED_MANIFEST_UNAVAILABLE', 'No se pudo confirmar el borrador guardado.', 503);
    const verified = reusableDraftIdentity(current, expected, path, previousVersionId);
    if (JSON.stringify(storedManifestDescriptor(current)) !== JSON.stringify(descriptor)) {
      throw new WorkbookEvidenceError('EXISTING_DOCUMENT_CONFLICT', 'La referencia del borrador cambió durante la lectura. Revísalo en la biblioteca.', 409);
    }
    const manifest = decodeWorkbookManifestArtifact(bytes, descriptor, {
      organizationId: current.organization_id, documentId: current.id,
      file: verified.file, counts: current.extraction_counts,
    });
    return evidenceResponse(responsePayload(manifest, { ...capabilities }, { id: current.id, fileName: current.document_name, status: 'draft', sha256: expected.file.sha256, version: current.version, previousVersionId }, true), request);
  }
  // Legacy inline drafts remain untouched and return their persisted extraction
  // literally, even if a newer parser reads the original differently.
  const { data, error } = await database.from('module_documents').select('manifest:extracted_data->manifest')
    .eq('organization_id', row.organization_id).eq('module', MODULE).eq('category', CATEGORY)
    .eq('id', row.id).eq('status', 'draft').eq('is_active', true).is('deleted_at', null).maybeSingle();
  if (!error && !data) {
    // A deletion may race the original download after the first identity read.
    const current = await documentById(database, row.organization_id, row.id, { onlyEvidence: true, includeDeleted: true });
    if (current) assertDraftNotArchived(current);
  }
  const manifest = data?.manifest as WorkbookEvidenceManifest | undefined;
  if (error || manifest?.schemaVersion !== WORKBOOK_EVIDENCE_SCHEMA_VERSION || manifest?.file?.sha256 !== expected.file.sha256 ||
      !Array.isArray(manifest.sheets) || !manifest.counts || !Array.isArray(manifest.warnings)) {
    throw new WorkbookEvidenceError('STORED_MANIFEST_UNAVAILABLE', 'No se pudo recuperar el manifiesto del borrador existente. No se modificó el original.', 503);
  }
  return evidenceResponse(responsePayload(manifest, capabilities, { id: row.id, fileName: row.document_name, status: 'draft', sha256: expected.file.sha256, version: row.version, previousVersionId }, true), request);
}

async function saveDraft(context: OrganizationSuccessContext, bytes: Uint8Array, manifest: WorkbookEvidenceManifest, previousVersionId: string | null, request: NextRequest, capabilities: WorkbookEvidenceCapabilities) {
  let version = 1;
  if (previousVersionId) {
    const previous = await documentById(context.supabase, context.organizationId, previousVersionId, { onlyEvidence: true });
    const verified = previous ? verifiedWorkbookEvidenceIdentity(previous) : null;
    if (!previous?.is_active || !verified ||
        !Number.isSafeInteger(previous.version) || previous.version < 1 || previous.version >= 2147483647) {
      throw new WorkbookEvidenceError('INVALID_PREVIOUS_VERSION', 'La versión anterior debe ser evidencia de esta biblioteca y organización.', 404);
    }
    if (verified.file.sha256 === manifest.file.sha256) {
      throw new WorkbookEvidenceError('UNCHANGED_VERSION', 'Los bytes coinciden con la versión anterior. No se creará una versión nueva sin cambios.', 409);
    }
    version = previous.version + 1;
    // This is an explicit predecessor link, not a claim of globally exclusive
    // version sequencing. Different uploads may branch from one predecessor.
  }
  const id = workbookEvidenceDocumentId(context.organizationId, manifest.file.sha256, previousVersionId);
  const path = workbookEvidenceStoragePath(context.organizationId, id, manifest.file.extension);
  // The deterministic identity survives soft deletion. Check its tombstone
  // before upload, and again after an insert conflict, without restoring it.
  const existing = await documentById(context.supabase, context.organizationId, id, { onlyEvidence: true, includeDeleted: true });
  if (existing) return reuseDraft(context.supabase, existing, manifest, path, previousVersionId, request, capabilities);

  const artifact = createWorkbookManifestArtifact(manifest, context.organizationId, id);
  const document = {
    id, organization_id: context.organizationId, module: MODULE, category: CATEGORY,
    canonical_section: 'library', document_name: manifest.file.name, document_type: manifest.file.extension,
    file_path: path, file_size_bytes: bytes.length, uploaded_by: context.userId,
    status: 'draft', provenance_status: 'supporting', canonical_role: 'supporting',
    version, previous_version_id: previousVersionId,
    description: 'Original y evidencia estructural del libro. Pendiente de revisión; no genera programación ni movimientos de inventario.',
    extracted_data: {
      schemaVersion: WORKBOOK_EVIDENCE_SCHEMA_VERSION, manifest: artifact.summary,
      manifestRepresentation: WORKBOOK_MANIFEST_REPRESENTATION, manifestStorage: artifact.descriptor,
      review_status: 'unreviewed',
    },
  };
  // Keep a hard database payload bound, including room for a different gzip
  // byte count if another writer already stored the same JSON representation.
  if (Buffer.byteLength(JSON.stringify(document)) > MAX_DOCUMENT_PAYLOAD_BYTES - 512) {
    throw new WorkbookEvidenceError('DOCUMENT_METADATA_TOO_LARGE', 'Los metadatos del borrador superan el límite de guardado. No se guardó ni recortó el archivo.', 413);
  }
  // Prepare the exact reviewable response before performing the explicit save.
  // A gzip negotiation or size error must never leave a newly saved draft.
  const preparedResponse = evidenceResponse(responsePayload(manifest, capabilities, { id, fileName: manifest.file.name, status: 'draft', sha256: manifest.file.sha256, version, previousVersionId }), request);
  const { error: uploadError } = await context.supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: manifest.file.extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel',
    cacheControl: '0', upsert: false,
  });
  if (uploadError) {
    // Retry after a DB failure or concurrent upload: reuse only exact bytes.
    // Never delete an immutable path that another request may have committed.
    const existingBytes = await downloadOriginal(context.supabase, context.organizationId, path);
    if (workbookBytesSha256(existingBytes) !== manifest.file.sha256) {
      throw new WorkbookEvidenceError('STORAGE_CONFLICT', 'Ya existe otro contenido en la ruta del original. No se sobrescribió.', 409);
    }
  }
  document.extracted_data.manifestStorage = await preserveManifestArtifact(context.supabase, context.organizationId, id, artifact);
  const insertResult = await context.supabase.from('module_documents').insert(document);
  if (insertResult.error) {
    const diagnostic = backendDiagnostic('document_insert', insertResult);
    let concurrent: DocumentRow | null;
    try {
      concurrent = await documentById(context.supabase, context.organizationId, id, { onlyEvidence: true, includeDeleted: true });
    } catch (error) {
      reportBackendFailure(diagnostic);
      if (error instanceof WorkbookEvidenceError && error.code === 'DOCUMENT_LOOKUP_FAILED') {
        throw new WorkbookEvidenceError('DRAFT_SAVE_UNCONFIRMED', 'El original y el manifiesto están conservados, pero no se pudo confirmar el registro del borrador. Reintenta con el mismo archivo para verificar el guardado.', 503, { ...diagnostic, recoveryLookupFailed: true });
      }
      throw error;
    }
    if (concurrent) return reuseDraft(context.supabase, concurrent, manifest, path, previousVersionId, request, capabilities);
    reportBackendFailure(diagnostic);
    throw new WorkbookEvidenceError('DRAFT_SAVE_INCOMPLETE', 'El original y el manifiesto están conservados, pero no se pudo crear el borrador. Reintenta con el mismo archivo para completar el guardado.', 503, diagnostic);
  }
  return preparedResponse;
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
    if (!access.authorized) return access.response;
    if (!access.organizationId || !access.user) throw new WorkbookEvidenceError('ORGANIZATION_REQUIRED', 'No se pudo verificar la organización de la sesión.', 403);
    let capabilities = saveDraftCapabilities(access.canWrite, access.role);
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().startsWith('application/json')) {
      let input: { action?: string; sourceKind?: string; sourceId?: string };
      try { input = JSON.parse((await boundedRequestBytes(request, 4096)).toString('utf8')); }
      catch (error) {
        if (error instanceof WorkbookEvidenceError) throw error;
        throw new WorkbookEvidenceError('INVALID_JSON', 'La referencia del original no es válida.', 400);
      }
      if (!input || input.action !== 'analyze' || input.sourceKind !== 'module_document' || !UUID.test(input.sourceId ?? '')) {
        throw new WorkbookEvidenceError('INVALID_SOURCE', 'Indica action=analyze, sourceKind=module_document y un sourceId válido.', 400);
      }
      // Analyze is a read-only operation despite POST's binary/request payload.
      // Its tenant comes only from the verified module-access context.
      const database = getSupabaseServerClient(access.user.id);
      const source = await documentById(database, access.organizationId, input.sourceId!);
      if (!source) throw new WorkbookEvidenceError('SOURCE_NOT_FOUND', 'El original no está disponible en tu organización y módulo.', 404);
      const bytes = await downloadOriginal(database, access.organizationId, source.file_path, source.file_size_bytes);
      const verified = verifiedWorkbookEvidenceIdentity(source);
      const fileName = verified?.file.name ||
        (/\.(xlsx|xls)$/i.test(source.document_name) ? source.document_name : source.file_path.split('/').pop()!);
      const manifest = parseWorkbookEvidence(bytes, fileName);
      const storedHash = verified?.file.sha256;
      if (storedHash && storedHash !== manifest.file.sha256) throw new WorkbookEvidenceError('ORIGINAL_HASH_MISMATCH', 'El original no coincide con el hash de la evidencia guardada.', 409);
      return evidenceResponse(responsePayload(manifest, capabilities), request);
    }
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new WorkbookEvidenceError('INVALID_CONTENT_TYPE', 'Adjunta el archivo como multipart/form-data.', 415);
    }
    const requestBytes = await boundedRequestBytes(request, WORKBOOK_UPLOAD_MAX_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(new Uint8Array(requestBytes), { headers: { 'Content-Type': contentType } }).formData(); }
    catch { throw new WorkbookEvidenceError('INVALID_MULTIPART', 'No se pudo leer el archivo adjunto.', 400); }
    const file = form.get('file');
    const action = form.get('action') ?? 'analyze';
    if (action !== 'analyze' && action !== 'save-draft') throw new WorkbookEvidenceError('INVALID_ACTION', 'La acción debe ser analyze o save-draft.', 400);
    if (!file || typeof file === 'string' || !file.name || file.name.length > 255 || /[\u0000-\u001f]/.test(file.name)) {
      throw new WorkbookEvidenceError('FILE_REQUIRED', 'Selecciona un archivo con un nombre válido de hasta 255 caracteres.', 400);
    }
    if (file.size > WORKBOOK_UPLOAD_MAX_BYTES) throw new WorkbookEvidenceError('UPLOAD_TOO_LARGE', 'El máximo de carga de este piloto es 3 MiB. No se guardó el archivo.', 413);
    let writeContext: OrganizationSuccessContext | undefined;
    let previousVersionId: string | null = null;
    if (action === 'save-draft') {
      const writeAccess = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
      if (!writeAccess.authorized) return writeAccess.response;
      const context = await getOrganizationContext(request);
      if (!context.ok) return context.response;
      if (context.organizationId !== access.organizationId || context.userId !== access.user.id) {
        throw new WorkbookEvidenceError('AUTH_CONTEXT_CHANGED', 'La sesión cambió durante la solicitud. Vuelve a intentarlo.', 403);
      }
      writeContext = context;
      capabilities = saveDraftCapabilities(writeAccess.canWrite, context.role);
      const previous = form.get('previousVersionId');
      if (previous) {
        if (typeof previous !== 'string' || !UUID.test(previous)) throw new WorkbookEvidenceError('INVALID_PREVIOUS_VERSION', 'La referencia de versión anterior no es válida.', 400);
        previousVersionId = previous;
      }
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const manifest = parseWorkbookEvidence(bytes, file.name, { maxBytes: WORKBOOK_UPLOAD_MAX_BYTES });
    if (writeContext) return await saveDraft(writeContext, bytes, manifest, previousVersionId, request, capabilities);
    return evidenceResponse(responsePayload(manifest, capabilities), request);
  } catch (error) { return errorResponse(error); }
}
