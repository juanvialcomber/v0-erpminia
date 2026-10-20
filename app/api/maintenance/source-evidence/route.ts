export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import {
  SOURCE_EVIDENCE_LIMIT, SOURCE_EVIDENCE_NO_STORE, SOURCE_EVIDENCE_REVIEW_STATUSES, SOURCE_EVIDENCE_TYPES,
  configuredMaintenanceSourceGroups, filterSourceEvidence, permittedMaintenanceSourceGroup,
  projectModuleDocumentEvidence, projectPlanningEvidence, projectWhatsappEvidence,
} from '@/lib/maintenance/source-evidence';
import type {
  ModuleDocumentEvidenceRow, PlanningEvidenceRow, SourceEvidenceAvailability, SourceEvidenceGroup,
  SourceEvidenceRecord, SourceEvidenceResponse, SourceEvidenceReviewStatus, SourceEvidenceType,
  WhatsappEvidenceMessage, WhatsappEvidenceRow,
} from '@/lib/maintenance/source-evidence';

const IMPORT_COLUMNS = 'id,organization_id,source_file,source_file_sha256,source_owner,source_role,source_sheet,imported_at,status,notes';
// Select only bounded metadata. A native cell manifest can be tens of MiB;
// neither full extracted_data nor an OCR transcript belongs in this catalogue.
const DOCUMENT_COLUMNS = 'id,organization_id,module,category,canonical_role,provenance_status,document_name,document_type,file_path,file_size_bytes,version,previous_version_id,created_at,uploaded_by,status,is_active,deleted_at,asset_id,canonical_section,l1_status,l2_status,reviewed_by_l1,reviewed_by_l2,reviewed_at_l1,reviewed_at_l2,extraction_schema:extracted_data->>schemaVersion,manifest_schema:extracted_data->manifest->>schemaVersion,extraction_file:extracted_data->manifest->file,extraction_counts:extracted_data->manifest->counts,extraction_state:extracted_data->>status,extraction_partial:extracted_data->>partial_due_to_limits';
const ATTACHMENT_COLUMNS = 'id,organization_id,group_id,message_id,original_file_name,mime_type,size_bytes,sha256,storage_path,download_status,scan_status,extraction_partial:extraction_json->>partial_due_to_limits,created_at';
const GROUP_COLUMNS = 'id,organization_id,chat_id,display_name,enabled';

type ReadResult<T> = { data: T[] | null; error: unknown; count?: number | null };

async function settleRead<T>(query: PromiseLike<unknown>): Promise<ReadResult<T>> {
  try { return await query as ReadResult<T>; }
  catch { return { data: null, error: true }; }
}

function availability(result: ReadResult<unknown>, returned: number, label: string): SourceEvidenceAvailability {
  if (result.error) return { status: 'unavailable', returned: 0, total: null, reason: `No se pudo consultar ${label}.` };
  const truncated = (result.data?.length || 0) > SOURCE_EVIDENCE_LIMIT || (result.count ?? 0) > SOURCE_EVIDENCE_LIMIT;
  return {
    status: truncated ? 'truncated' : 'available', returned, total: result.count ?? result.data?.length ?? 0,
    reason: truncated ? `Se cargaron las ${SOURCE_EVIDENCE_LIMIT} fuentes más recientes de ${label}.` : null,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.organizationId !== context.organizationId)
    return NextResponse.json({ error: 'No se pudo verificar la organización autorizada.' }, { status: 403, headers: SOURCE_EVIDENCE_NO_STORE });

  const params = request.nextUrl.searchParams;
  const q = (params.get('q') || '').trim();
  const sourceType = params.get('sourceType') || null;
  const review = params.get('review') || null;
  if (q.length > 160 || (sourceType && !SOURCE_EVIDENCE_TYPES.includes(sourceType as SourceEvidenceType))
      || (review && !SOURCE_EVIDENCE_REVIEW_STATUSES.includes(review as SourceEvidenceReviewStatus)))
    return NextResponse.json({ error: 'Filtros de fuentes inválidos.' }, { status: 400, headers: SOURCE_EVIDENCE_NO_STORE });
  const filters: SourceEvidenceResponse['filters'] = {
    q, sourceType: sourceType as SourceEvidenceType | null, review: review as SourceEvidenceReviewStatus | null,
  };

  const db = context.supabase;
  const organizationId = context.organizationId;
  const [importsResult, documentsResult] = await Promise.all([
    settleRead<PlanningEvidenceRow>(db.from('planning_maintenance_source_imports').select(IMPORT_COLUMNS, { count: 'exact' })
      .eq('organization_id', organizationId).order('imported_at', { ascending: false }).order('id', { ascending: false }).limit(SOURCE_EVIDENCE_LIMIT + 1)),
    settleRead<ModuleDocumentEvidenceRow>(db.from('module_documents').select(DOCUMENT_COLUMNS, { count: 'exact' })
      .eq('organization_id', organizationId).in('module', ['mantenimiento', 'maintenance']).is('deleted_at', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(SOURCE_EVIDENCE_LIMIT + 1)),
  ]);
  const imports = importsResult.error ? [] : (importsResult.data || []).slice(0, SOURCE_EVIDENCE_LIMIT)
    .filter(row => row.organization_id === organizationId).map(projectPlanningEvidence);
  const documents = documentsResult.error ? [] : (documentsResult.data || []).slice(0, SOURCE_EVIDENCE_LIMIT)
    .filter(row => row.organization_id === organizationId && ['mantenimiento', 'maintenance'].includes(row.module)).map(projectModuleDocumentEvidence);
  const sources: SourceEvidenceResponse['availability']['sources'] = {
    planning_import: availability(importsResult, imports.length, 'importaciones'),
    module_document: availability(documentsResult, documents.length, 'documentos de Mantenimiento'),
    whatsapp_attachment: { status: 'available', returned: 0, total: 0, reason: 'No hay grupos de WhatsApp autorizados para este catálogo de Mantenimiento.' },
  };
  const whatsapp: SourceEvidenceRecord[] = [];
  const warnings: string[] = [];
  let missingMessageContext = false;
  const configuredGroups = configuredMaintenanceSourceGroups(process.env.MAINTENANCE_SOURCE_GROUP_IDS);

  if (configuredGroups === null) {
    sources.whatsapp_attachment = { status: 'unavailable', returned: 0, total: null, reason: 'No se pudo verificar la configuración de fuentes de WhatsApp.' };
  } else if (configuredGroups.length) {
    const groupsResult = await settleRead<SourceEvidenceGroup>(db.from('motil_whatsapp_groups').select(GROUP_COLUMNS)
      .eq('organization_id', organizationId).in('id', configuredGroups).eq('enabled', true).limit(51));
    if (groupsResult.error || (groupsResult.data?.length || 0) > 50) {
      sources.whatsapp_attachment = { status: 'unavailable', returned: 0, total: null, reason: 'No se pudieron comprobar los grupos de origen autorizados.' };
    } else {
      const groups = (groupsResult.data || []).filter(group => permittedMaintenanceSourceGroup(group, organizationId, configuredGroups));
      const groupIds = groups.map(group => group.id);
      if (groupIds.length) {
        const attachmentsResult = await settleRead<WhatsappEvidenceRow>(db.from('motil_whatsapp_attachments').select(ATTACHMENT_COLUMNS, { count: 'exact' })
          .eq('organization_id', organizationId).in('group_id', groupIds).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(SOURCE_EVIDENCE_LIMIT + 1));
        const attachments = attachmentsResult.error ? [] : (attachmentsResult.data || []).slice(0, SOURCE_EVIDENCE_LIMIT)
          .filter(row => row.organization_id === organizationId && groupIds.includes(row.group_id));
        sources.whatsapp_attachment = availability(attachmentsResult, 0, 'adjuntos de WhatsApp autorizados');
        if (attachments.length) {
          const [messagesResult, liveGroupsResult] = await Promise.all([
            settleRead<WhatsappEvidenceMessage>(db.from('motil_whatsapp_messages')
              .select('id,organization_id,group_id,sender_name,file_name,occurred_at,received_at')
              .eq('organization_id', organizationId).in('group_id', groupIds).in('id', attachments.map(row => row.message_id))
              .limit(SOURCE_EVIDENCE_LIMIT)),
            settleRead<SourceEvidenceGroup>(db.from('motil_whatsapp_groups').select(GROUP_COLUMNS)
              .eq('organization_id', organizationId).in('id', groupIds).eq('enabled', true).limit(51)),
          ]);
          if (messagesResult.error || liveGroupsResult.error) {
            sources.whatsapp_attachment = { status: 'unavailable', returned: 0, total: null, reason: 'No se pudo verificar el contexto y la vigencia de los adjuntos.' };
          } else {
            const liveIds = (liveGroupsResult.data || []).filter(group => permittedMaintenanceSourceGroup(group, organizationId, configuredGroups)).map(group => group.id);
            const messages = new Map((messagesResult.data || []).filter(message => message.organization_id === organizationId && liveIds.includes(message.group_id))
              .map(message => [`${message.group_id}:${message.id}`, message]));
            for (const attachment of attachments) {
              const message = messages.get(`${attachment.group_id}:${attachment.message_id}`);
              if (liveIds.includes(attachment.group_id) && message) whatsapp.push(projectWhatsappEvidence(attachment, message));
            }
            sources.whatsapp_attachment.returned = whatsapp.length;
            if (whatsapp.length < attachments.length) {
              missingMessageContext = true;
              warnings.push('Se omitieron adjuntos cuyo mensaje o grupo vigente no pudo comprobarse.');
            }
          }
        }
      }
    }
  }

  const records = [...imports, ...documents, ...whatsapp].sort((a, b) => {
    const first = Date.parse(a.receivedAt || '') || 0;
    const second = Date.parse(b.receivedAt || '') || 0;
    return second - first || a.id.localeCompare(b.id);
  });
  const data = filterSourceEvidence(records, filters);
  for (const source of Object.values(sources)) if (source.reason) warnings.push(source.reason);
  if (Object.values(sources).some(source => source.status === 'truncated'))
    warnings.push('Los filtros se aplican al corte cargado, no a los archivos que quedaron fuera de ese límite.');
  const allUnavailable = sources.planning_import.status === 'unavailable' && sources.module_document.status === 'unavailable'
    && (sources.whatsapp_attachment.status === 'unavailable' || configuredGroups?.length === 0);
  const partial = Object.values(sources).some(source => source.status !== 'available') || missingMessageContext;
  const response: SourceEvidenceResponse = {
    data,
    summary: {
      loaded: records.length, matched: data.length,
      originalsAvailable: data.filter(record => record.original.status === 'available').length,
      pendingReview: data.filter(record => record.review.status === 'pending').length,
      // Neither an asset link nor a document approval establishes applicability.
      unknownApplicability: data.length,
    },
    availability: { status: allUnavailable ? 'unavailable' : partial ? 'partial' : 'complete', limitPerSource: SOURCE_EVIDENCE_LIMIT, sources, warnings },
    filters,
  };
  return NextResponse.json(response, { status: allUnavailable ? 503 : 200, headers: SOURCE_EVIDENCE_NO_STORE });
}
