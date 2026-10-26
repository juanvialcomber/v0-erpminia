export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const EVENTS = new Set(['session_started', 'decision_opened']);
const ACTIONS = new Set(['open_work_order', 'review_plan', 'schedule', 'refresh_reading']);

function cleanText(value: unknown, max = 120) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const event = cleanText(body?.event, 40);
  const sessionId = cleanText(body?.sessionId, 80);
  const weekFrom = cleanText(body?.weekFrom, 10);
  const weekUntil = cleanText(body?.weekUntil, 10);

  if (!event || !EVENTS.has(event) || !sessionId || !weekFrom || !weekUntil) {
    return NextResponse.json({ error: 'Evidencia de planificación inválida.' }, { status: 400 });
  }

  if (event === 'session_started') {
    const summary = body?.summary || {};
    const result = await context.supabase.from('audit_log').insert({
      organization_id: context.organizationId,
      user_id: context.userId,
      action: 'maintenance_weekly_planning_session_started',
      resource_type: 'maintenance_weekly_planning',
      resource_identifier: `${weekFrom}:${sessionId}`,
      new_values: {
        session_id: sessionId,
        week_from: weekFrom,
        week_until: weekUntil,
        decisions_prepared: Math.max(0, Number(summary.total) || 0),
        critical_current: Math.max(0, Number(summary.critical) || 0),
        scheduled: Math.max(0, Number(summary.scheduled) || 0),
        blocked_materials: Math.max(0, Number(summary.blockedMaterials) || 0),
        stale_evidence: Math.max(0, Number(summary.staleEvidence) || 0),
        metric_version: 'maintenance-weekly-planning-v1',
        semantics: 'planning session prepared by MOTIL; not saved time or economic impact',
      },
      user_agent: request.headers.get('user-agent'),
      status: 'completed',
    });

    if (result.error) {
      console.error('[planning/evidence:session]', result.error);
      return NextResponse.json({ error: 'No se pudo registrar la sesión de planificación.' }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  }

  const decisionAction = cleanText(body?.decisionAction, 40);
  const latencyMs = Number(body?.latencyMs);
  if (!decisionAction || !ACTIONS.has(decisionAction) || !Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 30 * 60 * 1000) {
    return NextResponse.json({ error: 'Decisión de planificación inválida.' }, { status: 400 });
  }

  const assetId = cleanText(body?.assetId, 80);
  const result = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action: 'maintenance_weekly_planning_decision_opened',
    resource_type: 'maintenance_asset_decision',
    resource_identifier: assetId || cleanText(body?.assetCode, 120) || `${weekFrom}:${sessionId}`,
    new_values: {
      session_id: sessionId,
      week_from: weekFrom,
      week_until: weekUntil,
      decision_action: decisionAction,
      decision_latency_ms: Math.round(latencyMs),
      asset_id: assetId,
      asset_code: cleanText(body?.assetCode, 120),
      priority: cleanText(body?.priority, 40),
      planning_state: cleanText(body?.planningState, 40),
      evidence_freshness: cleanText(body?.evidenceFreshness, 20),
      proposed_by_motil: body?.proposedByMotil === true,
      metric_version: 'maintenance-weekly-planning-v1',
      semantics: 'human opened a next planning action prepared by MOTIL; not acceptance, savings, or outcome',
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });

  if (result.error) {
    console.error('[planning/evidence:decision]', result.error);
    return NextResponse.json({ error: 'No se pudo registrar la decisión de planificación.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
