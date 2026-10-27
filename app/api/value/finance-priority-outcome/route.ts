export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const outcomes = new Set(['resolved', 'partially_resolved', 'no_change', 'escalated']);

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
    .select('action,resource_identifier,new_values,created_at')
    .eq('organization_id', context.organizationId)
    .in('action', ['finance_priority_decision', 'finance_priority_outcome'])
    .eq('resource_type', 'finance_priority')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (result.error) {
    console.error('[value/finance-priority-outcome:get]', result.error);
    return NextResponse.json({ error: 'No fue posible cargar los resultados financieros.' }, { status: 500 });
  }

  const rows = result.data || [];
  const outcomeByDecision = new Map<string, any>();
  for (const row of rows) {
    const identifier = String(row.resource_identifier || '');
    if (row.action === 'finance_priority_outcome' && identifier && !outcomeByDecision.has(identifier)) {
      outcomeByDecision.set(identifier, row);
    }
  }

  const accepted = rows
    .filter((row: any) =>
      row.action === 'finance_priority_decision' &&
      String(row.new_values?.decision || '') === 'accepted' &&
      Boolean(row.resource_identifier),
    )
    .map((row: any) => ({
      decisionIdentifier: String(row.resource_identifier),
      priorityKey: String(row.new_values?.priority_key || ''),
      decisionAt: row.created_at,
      outcome: outcomeByDecision.get(String(row.resource_identifier)) || null,
    }));

  const closed = accepted.filter((row: any) => row.outcome);
  const cycleSeconds = closed
    .map((row: any) => Number(row.outcome?.new_values?.decision_to_outcome_seconds))
    .filter((value: number) => Number.isFinite(value) && value >= 0);

  return NextResponse.json({
    accepted: accepted.length,
    openAccepted: accepted.filter((row: any) => !row.outcome).slice(0, 20),
    outcomes: {
      total: closed.length,
      resolved: closed.filter((row: any) => row.outcome?.new_values?.outcome === 'resolved').length,
      partiallyResolved: closed.filter((row: any) => row.outcome?.new_values?.outcome === 'partially_resolved').length,
      noChange: closed.filter((row: any) => row.outcome?.new_values?.outcome === 'no_change').length,
      escalated: closed.filter((row: any) => row.outcome?.new_values?.outcome === 'escalated').length,
      medianDecisionToOutcomeSeconds: cycleSeconds.length ? median(cycleSeconds) : null,
    },
    semantics: 'observed human-closed outcomes after an accepted MOTIL finance priority; outcome state is not savings, avoided cost or causal attribution',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const decisionIdentifier = typeof body?.decisionIdentifier === 'string' ? body.decisionIdentifier.trim() : '';
  const outcome = typeof body?.outcome === 'string' ? body.outcome.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';

  if (!decisionIdentifier || !outcomes.has(outcome)) {
    return NextResponse.json({ error: 'Decisión u outcome financiero no válido.' }, { status: 400 });
  }
  if ((outcome === 'no_change' || outcome === 'escalated') && !note) {
    return NextResponse.json({ error: 'Indica brevemente qué ocurrió.' }, { status: 400 });
  }

  const decisionResult = await context.supabase
    .from('audit_log')
    .select('resource_identifier,new_values,created_at')
    .eq('organization_id', context.organizationId)
    .eq('action', 'finance_priority_decision')
    .eq('resource_type', 'finance_priority')
    .eq('resource_identifier', decisionIdentifier)
    .maybeSingle();

  if (decisionResult.error || !decisionResult.data) {
    return NextResponse.json({ error: 'La decisión financiera no existe.' }, { status: 404 });
  }
  if (String(decisionResult.data.new_values?.decision || '') !== 'accepted') {
    return NextResponse.json({ error: 'Sólo una prioridad tomada puede registrar outcome.' }, { status: 409 });
  }

  const duplicate = await context.supabase
    .from('audit_log')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('action', 'finance_priority_outcome')
    .eq('resource_type', 'finance_priority')
    .eq('resource_identifier', decisionIdentifier)
    .limit(1);

  if (duplicate.error) {
    return NextResponse.json({ error: 'No fue posible verificar el cierre.' }, { status: 503 });
  }
  if ((duplicate.data || []).length > 0) {
    return NextResponse.json({ error: 'Esta prioridad ya tiene un resultado registrado.' }, { status: 409 });
  }

  const decisionAtMs = Date.parse(String(decisionResult.data.created_at || ''));
  const decisionToOutcomeSeconds = Number.isFinite(decisionAtMs)
    ? Math.max(0, Math.round((Date.now() - decisionAtMs) / 1000))
    : null;

  const result = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action: 'finance_priority_outcome',
    resource_type: 'finance_priority',
    resource_identifier: decisionIdentifier,
    new_values: {
      priority_key: String(decisionResult.data.new_values?.priority_key || ''),
      outcome,
      note: note || null,
      decision_to_outcome_seconds: decisionToOutcomeSeconds,
      metric_version: 'finance-priority-outcome-v1',
      semantics: 'human-confirmed outcome after an accepted MOTIL finance priority; not savings, avoided cost or causal attribution',
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });

  if (result.error) {
    console.error('[value/finance-priority-outcome]', result.error);
    return NextResponse.json({ error: 'No fue posible registrar el resultado financiero.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    decisionIdentifier,
    outcome,
    decisionToOutcomeSeconds,
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
  });
}
