export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const decisions = new Set(['accepted', 'deferred', 'rejected']);
const priorityKeys = new Set([
  'freshness',
  'overdue',
  'due-soon',
  'supplier-concentration',
  'deposit',
  'cost-centers',
  'accounting',
]);

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
    : Math.round(sorted[midpoint]);
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const result = await context.supabase
    .from('audit_log')
    .select('new_values,created_at')
    .eq('organization_id', context.organizationId)
    .eq('action', 'finance_priority_decision')
    .eq('resource_type', 'finance_priority')
    .order('created_at', { ascending: false })
    .limit(500);

  if (result.error) {
    console.error('[value/finance-priority-decision:get]', result.error);
    return NextResponse.json({ error: 'No fue posible cargar las decisiones financieras.' }, { status: 500 });
  }

  const rows = (result.data || []).map((row: any) => ({
    decision: String(row.new_values?.decision || ''),
    priorityKey: String(row.new_values?.priority_key || ''),
    latencyMs: Number(row.new_values?.decision_latency_ms),
    createdAt: row.created_at,
  })).filter((row: any) => decisions.has(row.decision) && priorityKeys.has(row.priorityKey));

  const latencies = rows
    .map((row: any) => row.latencyMs)
    .filter((value: number) => Number.isFinite(value) && value >= 0 && value <= 30 * 60 * 1000);

  return NextResponse.json({
    total: rows.length,
    accepted: rows.filter((row: any) => row.decision === 'accepted').length,
    deferred: rows.filter((row: any) => row.decision === 'deferred').length,
    rejected: rows.filter((row: any) => row.decision === 'rejected').length,
    timedDecisions: latencies.length,
    medianDecisionSeconds: latencies.length ? Math.round((median(latencies) || 0) / 1000) : null,
    latestAt: rows[0]?.createdAt || null,
    semantics: 'explicit human decisions on MOTIL-prioritized finance actions; no Laudus or canonical mutation',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const priorityKey = typeof body?.priorityKey === 'string' ? body.priorityKey.trim() : '';
  const decision = typeof body?.decision === 'string' ? body.decision.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  const decisionLatencyMs = Number(body?.decisionLatencyMs);

  if (!priorityKeys.has(priorityKey) || !decisions.has(decision)) {
    return NextResponse.json({ error: 'Prioridad o decisión financiera no válida.' }, { status: 400 });
  }
  if (decision === 'rejected' && !reason) {
    return NextResponse.json({ error: 'Indica por qué esta prioridad no aplica.' }, { status: 400 });
  }
  if (
    !Number.isFinite(decisionLatencyMs) ||
    decisionLatencyMs < 0 ||
    decisionLatencyMs > 30 * 60 * 1000
  ) {
    return NextResponse.json({ error: 'Tiempo de decisión fuera de rango.' }, { status: 400 });
  }

  const result = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action: 'finance_priority_decision',
    resource_type: 'finance_priority',
    resource_identifier: `${priorityKey}-${new Date().toISOString()}`,
    new_values: {
      priority_key: priorityKey,
      decision,
      reason: reason || null,
      decision_latency_ms: Math.round(decisionLatencyMs),
      metric_version: 'finance-priority-decision-v1',
      semantics: 'time from Daniel finance cockpit load to explicit human decision on a MOTIL-prioritized finance action; no Laudus or canonical mutation',
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });

  if (result.error) {
    console.error('[value/finance-priority-decision]', result.error);
    return NextResponse.json({ error: 'No fue posible registrar la decisión financiera.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    priorityKey,
    decision,
    decisionLatencyMs: Math.round(decisionLatencyMs),
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
  });
}
