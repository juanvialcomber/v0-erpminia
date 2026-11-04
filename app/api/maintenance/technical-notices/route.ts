export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, isAdminRole, MODULE_KEYS } from '@/lib/api/module-access';

type Notice = {
  id: string;
  source: 'operational_review' | 'condition_signal' | 'meter_review';
  state: 'evaluate' | 'monitor' | 'ready_for_work_order';
  priority: 'high' | 'normal';
  title: string;
  detail: string;
  evidence: string;
  canonicalAssetId: string | null;
  occurredAt: string | null;
  href: string;
};

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const maintenanceAccess = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (maintenanceAccess === 'SR' && !isAdminRole(context.role)) {
    return NextResponse.json({ error: 'No tienes acceso a avisos de mantenimiento.' }, { status: 403 });
  }

  try {
    const [operational, condition, meter] = await Promise.all([
      context.supabase
        .from('drilling_maintenance_review_queue_v1')
        .select('review_id,canonical_asset_id,asset_code,asset_name,operation_date,review_reason,equipment_status_raw,machine_observations,review_status,linked_work_order_id,has_linked_work_order')
        .eq('organization_id', context.organizationId)
        .in('review_status', ['pending', 'accepted'])
        .order('operation_date', { ascending: false })
        .limit(100),
      context.supabase
        .from('maintenance_condition_signal_reviews')
        .select('id,signal_key,canonical_asset_id,signal_type,decision,decision_note,evidence_snapshot,reviewed_at,updated_at')
        .eq('organization_id', context.organizationId)
        .in('decision', ['monitor', 'confirmed'])
        .order('updated_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('maintenance_meter_review_queue')
        .select('id,canonical_asset_id,submitted_hours,previous_hours,attempted_at,reason,evidence_path,status')
        .eq('organization_id', context.organizationId)
        .in('status', ['pending', 'open'])
        .order('attempted_at', { ascending: false })
        .limit(100),
    ]);

    if (operational.error) throw operational.error;
    if (condition.error) throw condition.error;
    if (meter.error) throw meter.error;

    const notices: Notice[] = [];

    for (const row of operational.data || []) {
      if (row.has_linked_work_order || row.linked_work_order_id) continue;
      const accepted = row.review_status === 'accepted';
      notices.push({
        id: `operational:${row.review_id}`,
        source: 'operational_review',
        state: accepted ? 'ready_for_work_order' : 'evaluate',
        priority: row.review_reason === 'out_of_service' ? 'high' : 'normal',
        title: [row.asset_code, row.asset_name].filter(Boolean).join(' · ') || 'Equipo por revisar',
        detail: row.machine_observations || row.equipment_status_raw || row.review_reason || 'Condición operacional por revisar.',
        evidence: `Sondaje · ${row.operation_date || 'sin fecha'} · ${row.review_reason || 'observación'}`,
        canonicalAssetId: row.canonical_asset_id || null,
        occurredAt: row.operation_date ? `${row.operation_date}T12:00:00` : null,
        href: '/dashboard/produccion',
      });
    }

    for (const row of condition.data || []) {
      const snapshot = row.evidence_snapshot || {};
      const metric = snapshot.metric == null ? null : Number(snapshot.metric);
      const baseline = snapshot.baseline == null ? null : Number(snapshot.baseline);
      const detailParts = [
        Number.isFinite(metric) ? `actual ${metric}` : null,
        Number.isFinite(baseline) ? `base ${baseline}` : null,
        row.decision_note || null,
      ].filter(Boolean);
      notices.push({
        id: `condition:${row.id}`,
        source: 'condition_signal',
        state: row.decision === 'confirmed' ? 'ready_for_work_order' : 'monitor',
        priority: row.decision === 'confirmed' ? 'high' : 'normal',
        title: row.signal_type ? `Señal de condición · ${row.signal_type}` : 'Señal de condición',
        detail: detailParts.join(' · ') || 'Señal revisada con evidencia disponible.',
        evidence: `Condition Intelligence · ${row.signal_key}`,
        canonicalAssetId: row.canonical_asset_id || null,
        occurredAt: row.reviewed_at || row.updated_at || null,
        href: '/dashboard/mantenimiento/confiabilidad',
      });
    }

    for (const row of meter.data || []) {
      notices.push({
        id: `meter:${row.id}`,
        source: 'meter_review',
        state: 'evaluate',
        priority: row.reason === 'meter_below_last_execution' ? 'high' : 'normal',
        title: 'Horómetro requiere revisión',
        detail: `${row.previous_hours ?? '—'} → ${row.submitted_hours ?? '—'} h · ${row.reason || 'evidencia inconsistente'}`,
        evidence: row.evidence_path || 'Lectura observada',
        canonicalAssetId: row.canonical_asset_id || null,
        occurredAt: row.attempted_at || null,
        href: '/dashboard/mantenimiento/horometros',
      });
    }

    notices.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
      return String(b.occurredAt || '').localeCompare(String(a.occurredAt || ''));
    });

    const summary = {
      total: notices.length,
      evaluate: notices.filter((row) => row.state === 'evaluate').length,
      monitor: notices.filter((row) => row.state === 'monitor').length,
      readyForWorkOrder: notices.filter((row) => row.state === 'ready_for_work_order').length,
      highPriority: notices.filter((row) => row.priority === 'high').length,
    };

    return NextResponse.json({
      summary,
      notices,
      semantics: {
        derivedQueue: 'Avisos técnicos deriva estado desde revisiones existentes; no crea un maestro paralelo.',
        humanAuthority: 'MOTIL no crea una OT desde esta bandeja. Ariel o Mantención debe confirmar y usar el flujo original.',
        evidenceBoundary: 'Un aviso es evidencia por revisar, no diagnóstico ni falla confirmada.',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron cargar los avisos técnicos.' },
      { status: 500 },
    );
  }
}
