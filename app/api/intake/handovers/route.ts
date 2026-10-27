export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess, isAdminRole } from '@/lib/api/module-access';
import { summarizePortero } from '@/lib/intake/portero.mjs';

const moduleBySection = {
  maintenance: MODULE_KEYS.MANT_OPERACIONES,
  production: MODULE_KEYS.PROD_OPERACIONES,
  finance: MODULE_KEYS.FIN_FINANZAS,
  hse: MODULE_KEYS.HSE_TABLERO,
} as const;
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get('section') || '';
  if (!Object.hasOwn(moduleBySection, section) && section !== 'data_health')
    return NextResponse.json({ error: 'Sección no válida' }, { status: 400, headers });
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (section === 'data_health') {
    if (!isAdminRole(context.role)) return NextResponse.json({ error: 'Acceso administrativo requerido' }, { status: 403, headers });
  } else {
    const access = await requireModuleAccess(request, moduleBySection[section as keyof typeof moduleBySection]);
    if (!access.authorized) return access.response;
  }

  // Project only the handover metadata, not 332 sheets of profiling, raw OCR,
  // attachment storage locations, Gmail URLs or source message bodies.
  const mail = await context.supabase.from('motil_email_source_manifest')
    .select('id,filename,source_cutoff_date,email_sent_at,handover:source_profile->portero')
    .eq('organization_id', context.organizationId)
    .eq('source_profile->portero->>section', section)
    .order('email_sent_at', { ascending: false }).limit(51);
  if (mail.error) return NextResponse.json({ error: 'No se pudo consultar el traspaso' }, { status: 503, headers });

  let mediaRows: any[] = [];
  let dailyRows: any[] = [];
  let dailyTruncated = false;
  if (section === 'data_health' || section === 'production' || section === 'hse') {
    const groups = await context.supabase.from('motil_whatsapp_groups').select('id')
      .eq('organization_id', context.organizationId).eq('enabled', true).limit(21);
    if (groups.error || (groups.data?.length || 0) > 20)
      return NextResponse.json({ error: 'No se pudo verificar el alcance de grupos' }, { status: 503, headers });
    if (groups.data?.length) {
      if (section === 'data_health') {
      const media = await context.supabase.from('motil_whatsapp_attachments')
        .select('id,original_file_name,handover:extraction_json->portero')
        .eq('organization_id', context.organizationId).in('group_id', groups.data.map(g => g.id))
        .eq('extraction_json->portero->>section', section).order('created_at', { ascending: false }).limit(51);
      if (media.error) return NextResponse.json({ error: 'No se pudieron consultar los bloqueos' }, { status: 503, headers });
      mediaRows = media.data || [];
      } else {
        const reports = await context.supabase.from('motil_whatsapp_daily_reports')
          .select('id,report_date,findings').eq('organization_id', context.organizationId)
          .contains('findings', [{ portero: { section } }])
          .order('report_date', { ascending: false }).limit(6);
        if (reports.error) return NextResponse.json({ error: 'No se pudieron consultar los reportes derivados' }, { status: 503, headers });
        dailyTruncated = (reports.data?.length || 0) > 5;
        const findings = (reports.data || []).slice(0, 5).flatMap((report: any) => (Array.isArray(report.findings) ? report.findings : [])
          .filter((finding: any) => finding.portero?.section === section)
          .map((finding: any) => ({ report, finding })));
        const sourceIds = [...new Set(findings.flatMap(({ finding }: any) => Array.isArray(finding.source_ids) ? finding.source_ids : []))];
        if (sourceIds.length > 200) return NextResponse.json({ error: 'El traspaso supera el presupuesto de verificación' }, { status: 503, headers });
        const allowedIds = new Set<number>();
        for (let offset = 0; offset < sourceIds.length; offset += 50) {
          const sources = await context.supabase.from('motil_whatsapp_messages').select('id')
            .eq('organization_id', context.organizationId).in('group_id', groups.data.map(g => g.id))
            .in('id', sourceIds.slice(offset, offset + 50)).limit(50);
          if (sources.error) return NextResponse.json({ error: 'No se pudo verificar la evidencia de origen' }, { status: 503, headers });
          for (const source of sources.data || []) allowedIds.add(Number(source.id));
        }
        dailyRows = findings.filter(({ finding }: any) => finding.source_ids?.length > 0 && finding.source_ids.every((id: number) => allowedIds.has(Number(id))))
          .map(({ report, finding }: any) => ({ id: finding.portero.source_identity, channel: 'whatsapp',
            label: `Novedad informada: ${String(finding.detail || '').slice(0, 240)}`, sourceDate: report.report_date,
            receivedAt: null, handover: finding.portero }));
      }
    }
  }
  const truncated = (mail.data?.length || 0) > 50 || mediaRows.length > 50 || dailyTruncated;
  const rows = [...(mail.data || []).slice(0, 50).map((row: any) => ({ id: row.id, channel: 'email', label: row.filename, sourceDate: row.source_cutoff_date, receivedAt: row.email_sent_at, handover: row.handover })),
    ...mediaRows.slice(0, 50).map(row => ({ id: row.id, channel: 'whatsapp', label: row.original_file_name || 'Adjunto de WhatsApp', sourceDate: null, receivedAt: null, handover: row.handover })), ...dailyRows];
  return NextResponse.json({ section, rows, summary: summarizePortero(rows.map(r => r.handover || {})), truncated,
    coverage: 'registered_handoffs_only', canonicalApproval: false }, { headers });
}
