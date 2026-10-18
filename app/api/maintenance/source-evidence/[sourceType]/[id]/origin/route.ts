export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import {
  SOURCE_EVIDENCE_NO_STORE, SOURCE_EVIDENCE_TYPES, SOURCE_EVIDENCE_UUID,
  configuredMaintenanceSourceGroups, permittedMaintenanceSourceGroup, sourceEvidenceStoragePath,
} from '@/lib/maintenance/source-evidence';
import type { SourceEvidenceGroup, SourceEvidenceType } from '@/lib/maintenance/source-evidence';

const EXPIRES_IN = 120;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: SOURCE_EVIDENCE_NO_STORE });
}

export async function GET(request: NextRequest, route: { params: Promise<{ sourceType: string; id: string }> }) {
  try {
    const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
    if (!access.authorized) return access.response;
    const context = await getOrganizationContext(request);
    if (!context.ok) return context.response;
    if (access.organizationId !== context.organizationId) return error('No se pudo verificar la organización autorizada.', 403);

    const { sourceType, id } = await route.params;
    if (!SOURCE_EVIDENCE_TYPES.includes(sourceType as SourceEvidenceType) || !SOURCE_EVIDENCE_UUID.test(id)) return error('Fuente inválida.', 400);
    const db = context.supabase;
    const organizationId = context.organizationId;
    let path: string | null = null;
    let bucket: 'module-documents' | 'motil-whatsapp-evidence';

    if (sourceType === 'planning_import') {
      const { data, error: queryError } = await db.from('planning_maintenance_source_imports').select('id,organization_id')
        .eq('organization_id', organizationId).eq('id', id).maybeSingle();
      if (queryError) return error('La fuente está temporalmente no disponible.', 503);
      if (!data || data.organization_id !== organizationId) return error('Original no disponible.', 404);
      return error('La importación no registra un archivo original accesible.', 404);
    }

    if (sourceType === 'module_document') {
      const { data, error: queryError } = await db.from('module_documents').select('id,organization_id,module,file_path')
        .eq('organization_id', organizationId).in('module', ['mantenimiento', 'maintenance']).is('deleted_at', null).eq('id', id).maybeSingle();
      if (queryError) return error('El documento está temporalmente no disponible.', 503);
      if (!data || data.organization_id !== organizationId || !['mantenimiento', 'maintenance'].includes(data.module)) return error('Original no disponible.', 404);
      path = sourceEvidenceStoragePath('module_document', data.file_path, organizationId);
      bucket = 'module-documents';
    } else {
      const configuredGroups = configuredMaintenanceSourceGroups(process.env.MAINTENANCE_SOURCE_GROUP_IDS);
      if (configuredGroups === null) return error('No se pudo verificar el alcance de las fuentes.', 503);
      if (!configuredGroups.length) return error('Original no disponible en el alcance de Mantenimiento.', 404);
      const { data, error: queryError } = await db.from('motil_whatsapp_attachments')
        .select('id,organization_id,group_id,message_id,storage_path,download_status')
        .eq('organization_id', organizationId).in('group_id', configuredGroups).eq('id', id).maybeSingle();
      if (queryError) return error('El adjunto está temporalmente no disponible.', 503);
      if (!data || data.organization_id !== organizationId || !configuredGroups.includes(data.group_id) || data.download_status !== 'stored') return error('Original no disponible.', 404);
      const [{ data: message, error: messageError }, { data: group, error: groupError }] = await Promise.all([
        db.from('motil_whatsapp_messages').select('id,organization_id,group_id')
          .eq('organization_id', organizationId).eq('group_id', data.group_id).eq('id', data.message_id).maybeSingle(),
        db.from('motil_whatsapp_groups').select('id,organization_id,chat_id,display_name,enabled')
          .eq('organization_id', organizationId).eq('id', data.group_id).eq('enabled', true).maybeSingle(),
      ]);
      if (messageError || groupError) return error('No se pudo comprobar el origen autorizado.', 503);
      if (!message || message.organization_id !== organizationId || message.group_id !== data.group_id
          || !group || !permittedMaintenanceSourceGroup(group as SourceEvidenceGroup, organizationId, configuredGroups))
        return error('Original no disponible en el alcance de Mantenimiento.', 404);
      path = sourceEvidenceStoragePath('whatsapp_attachment', data.storage_path, organizationId);
      bucket = 'motil-whatsapp-evidence';
    }

    if (!path) return error('El registro no contiene una ruta válida al original privado.', 404);
    const { data: signed, error: signedError } = await db.storage.from(bucket).createSignedUrl(path, EXPIRES_IN);
    if (signedError || !signed?.signedUrl) return error('No se pudo abrir el original. Intenta nuevamente.', 503);
    if (request.headers.get('accept')?.includes('application/json'))
      return NextResponse.json({ url: signed.signedUrl, expiresIn: EXPIRES_IN }, { headers: SOURCE_EVIDENCE_NO_STORE });
    const response = NextResponse.redirect(signed.signedUrl);
    for (const [header, value] of Object.entries(SOURCE_EVIDENCE_NO_STORE)) response.headers.set(header, value);
    return response;
  } catch {
    return error('El origen está temporalmente no disponible. Intenta nuevamente.', 503);
  }
}
