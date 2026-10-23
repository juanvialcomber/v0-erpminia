export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const ACTION_REASON_CODES = new Set([
  'request_quote',
  'diversify_supplier',
  'validate_price',
  'replenish_stock',
  'check_inventory',
  'maintenance_followup',
  'other',
]);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rawScope = Number(request.nextUrl.searchParams.get('days') || 365);
  const scopeDays = Number.isFinite(rawScope)
    ? Math.min(Math.max(Math.trunc(rawScope), 90), 730)
    : 365;

  const { data, error } = await context.supabase.rpc('motil_supply_risk_preview', {
    p_organization_id: context.organizationId,
    p_scope_days: scopeDays,
  });

  if (error) {
    console.error('[procurement/supply-risk]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular el riesgo de abastecimiento.' },
      { status: 500 },
    );
  }

  const decisionResult = await context.supabase
    .from('procurement_supply_risk_decisions')
    .select('id,product_id,product_code,decision,reason_code,note,risk_score,risk_reasons,evidence_snapshot,decided_by,decided_at')
    .eq('organization_id', context.organizationId)
    .order('decided_at', { ascending: false })
    .limit(500);

  if (decisionResult.error) {
    console.error('[procurement/supply-risk decisions]', decisionResult.error);
    return NextResponse.json({ error: 'No fue posible cargar las decisiones de abastecimiento.' }, { status: 500 });
  }

  const decisions = decisionResult.data || [];
  const actionDecisions = decisions.filter((row) => row.decision === 'action_required');
  const actionDecisionIds = actionDecisions.map((row) => row.id);

  let outcomes: any[] = [];
  if (actionDecisionIds.length) {
    const outcomeResult = await context.supabase
      .from('procurement_supply_risk_outcomes')
      .select('id,decision_id,product_id,outcome,note,risk_score_before,risk_score_after,time_to_outcome_ms,recorded_by,recorded_at')
      .eq('organization_id', context.organizationId)
      .in('decision_id', actionDecisionIds.slice(0, 100))
      .order('recorded_at', { ascending: false });

    if (outcomeResult.error) {
      console.error('[procurement/supply-risk outcomes]', outcomeResult.error);
      return NextResponse.json({ error: 'No fue posible cargar los resultados de abastecimiento.' }, { status: 500 });
    }
    outcomes = outcomeResult.data || [];
  }

  const latestByProduct = new Map<string, any>();
  for (const row of decisions) {
    if (!latestByProduct.has(row.product_id)) latestByProduct.set(row.product_id, row);
  }

  const pending = (data?.top_actions || []).filter((row: any) => {
    const previous = latestByProduct.get(row.product_id);
    if (!previous) return true;
    return Number(previous.risk_score) !== Number(row.risk_score);
  });

  const actionRequired = actionDecisions.length;
  const reviewed = decisions.filter((row) => row.decision === 'reviewed').length;
  const notApplicable = decisions.filter((row) => row.decision === 'not_applicable').length;

  const outcomesByDecision = new Map(outcomes.map((row) => [row.decision_id, row]));
  const currentByProduct = new Map((data?.top_actions || []).map((row: any) => [row.product_id, row]));
  const openActions = actionDecisions
    .filter((row) => !outcomesByDecision.has(row.id))
    .map((row) => {
      const current: any = currentByProduct.get(row.product_id);
      return {
        ...row,
        current_risk_score: current?.risk_score ?? 0,
        current_signal_active: Boolean(current),
        current_risk_reasons: current?.risk_reasons || [],
      };
    })
    .slice(0, 12);

  const outcomeIds = outcomes.map((row) => row.id);
  let valueEvidence: any[] = [];
  if (outcomeIds.length) {
    const valueResult = await context.supabase
      .from('procurement_supply_value_evidence')
      .select('id,outcome_id,decision_id,product_id,impact_type,observed_value_clp,observed_minutes,evidence_level,basis_note,evidence_reference,recorded_by,recorded_at')
      .eq('organization_id', context.organizationId)
      .in('outcome_id', outcomeIds.slice(0, 100))
      .order('recorded_at', { ascending: false });

    if (valueResult.error) {
      console.error('[procurement/supply-risk value-evidence]', valueResult.error);
      return NextResponse.json({ error: 'No fue posible cargar la evidencia de valor.' }, { status: 500 });
    }
    valueEvidence = valueResult.data || [];
  }

  const closedOutcomes = outcomes.length;
  const positiveOutcomes = outcomes.filter((row) => ['resolved','risk_reduced'].includes(row.outcome)).length;
  const falsePositives = outcomes.filter((row) => row.outcome === 'false_positive').length;
  const measuredTimes = outcomes.map((row) => Number(row.time_to_outcome_ms)).filter((value) => Number.isFinite(value) && value >= 0);
  const riskDeltas = outcomes
    .map((row) => Number(row.risk_score_before) - Number(row.risk_score_after))
    .filter((value) => Number.isFinite(value));

  const observedValueClp = valueEvidence
    .map((row) => Number(row.observed_value_clp))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .reduce((sum, value) => sum + value, 0);
  const observedMinutes = valueEvidence
    .map((row) => Number(row.observed_minutes))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .reduce((sum, value) => sum + value, 0);
  const e3Count = valueEvidence.filter((row) => row.evidence_level === 'E3').length;

  return NextResponse.json({
    ...data,
    pending: pending.slice(0, 12),
    decisions: decisions.slice(0, 12),
    openActions,
    outcomes: outcomes.slice(0, 12),
    valueEvidence: valueEvidence.slice(0, 12),
    valueMetrics: {
      records: valueEvidence.length,
      observedValueClp,
      observedMinutes,
      e3Count,
      maturity: e3Count > 0 ? 'E3' : valueEvidence.length > 0 ? 'E2' : 'E1',
    },
    outcomeMetrics: {
      openActions: openActions.length,
      closedOutcomes,
      positiveOutcomes,
      falsePositives,
      positiveRate: closedOutcomes ? positiveOutcomes / closedOutcomes : null,
      averageTimeToOutcomeHours: measuredTimes.length
        ? measuredTimes.reduce((sum, value) => sum + value, 0) / measuredTimes.length / 3600000
        : null,
      averageRiskReduction: riskDeltas.length
        ? riskDeltas.reduce((sum, value) => sum + value, 0) / riskDeltas.length
        : null,
      evidenceLevel: closedOutcomes > 0 ? 'E2' : 'E1',
    },
    decisionMetrics: {
      reviewed,
      actionRequired,
      notApplicable,
      total: decisions.length,
      actionRate: decisions.length ? actionRequired / decisions.length : null,
    },
    readOnly: false,
    sourceModified: false,
    canonicalModified: false,
    generatedAt: new Date().toISOString(),
  });
}


export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const valueOutcomeId = String(body?.valueOutcomeId || '').trim();
  const impactType = String(body?.impactType || '').trim();
  const basisNote = String(body?.basisNote || '').trim();
  const evidenceReference = String(body?.evidenceReference || '').trim();
  const observedValueClpRaw = body?.observedValueClp;
  const observedMinutesRaw = body?.observedMinutes;
  const productId = String(body?.productId || '').trim();
  const outcomeDecisionId = String(body?.outcomeDecisionId || '').trim();
  const outcome = String(body?.outcome || '').trim();
  const decision = String(body?.decision || '').trim();
  const reasonCode = String(body?.reasonCode || '').trim();
  const note = String(body?.note || '').trim();

  if (valueOutcomeId) {
    const allowedImpactTypes = new Set([
      'time_saved','validated_price_difference','stockout_prevented','risk_reduced','other',
    ]);
    if (!allowedImpactTypes.has(impactType) || basisNote.length < 10) {
      return NextResponse.json({ error: 'Completa el tipo de impacto y su base de evidencia.' }, { status: 400 });
    }

    const outcomeResult = await context.supabase
      .from('procurement_supply_risk_outcomes')
      .select('id,decision_id,product_id,outcome')
      .eq('organization_id', context.organizationId)
      .eq('id', valueOutcomeId)
      .maybeSingle();

    if (outcomeResult.error || !outcomeResult.data) {
      return NextResponse.json({ error: 'El resultado de abastecimiento no existe.' }, { status: 404 });
    }

    const observedValueClp = observedValueClpRaw === '' || observedValueClpRaw == null
      ? null : Number(observedValueClpRaw);
    const observedMinutes = observedMinutesRaw === '' || observedMinutesRaw == null
      ? null : Number(observedMinutesRaw);

    if (observedValueClp !== null && (!Number.isFinite(observedValueClp) || observedValueClp < 0)) {
      return NextResponse.json({ error: 'Monto observado inválido.' }, { status: 400 });
    }
    if (observedMinutes !== null && (!Number.isFinite(observedMinutes) || observedMinutes < 0)) {
      return NextResponse.json({ error: 'Tiempo observado inválido.' }, { status: 400 });
    }

    const evidenceLevel = evidenceReference.length >= 5 ? 'E3' : 'E2';
    const result = await context.supabase
      .from('procurement_supply_value_evidence')
      .insert({
        organization_id: context.organizationId,
        outcome_id: outcomeResult.data.id,
        decision_id: outcomeResult.data.decision_id,
        product_id: outcomeResult.data.product_id,
        impact_type: impactType,
        observed_value_clp: observedValueClp,
        observed_minutes: observedMinutes,
        evidence_level: evidenceLevel,
        basis_note: basisNote,
        evidence_reference: evidenceReference || null,
        recorded_by: context.userId,
        recorded_at: new Date().toISOString(),
      })
      .select('id,outcome_id,decision_id,product_id,impact_type,observed_value_clp,observed_minutes,evidence_level,basis_note,evidence_reference,recorded_by,recorded_at')
      .single();

    if (result.error) {
      const duplicate = String(result.error.code || '') === '23505';
      return NextResponse.json(
        { error: duplicate ? 'Este impacto ya fue registrado para el resultado.' : 'No fue posible guardar la evidencia de valor.' },
        { status: duplicate ? 409 : 500 },
      );
    }

    return NextResponse.json({
      valueEvidence: result.data,
      accountingModified: false,
      canonicalModified: false,
      message: evidenceLevel === 'E3'
        ? 'Impacto observado registrado con referencia de evidencia.'
        : 'Impacto observado registrado como evidencia E2.',
    });
  }

  if (outcomeDecisionId) {
    if (!['resolved','risk_reduced','no_change','false_positive'].includes(outcome)) {
      return NextResponse.json({ error: 'Resultado inválido.' }, { status: 400 });
    }
    if (['no_change','false_positive'].includes(outcome) && note.length < 3) {
      return NextResponse.json({ error: 'Describe brevemente el resultado.' }, { status: 400 });
    }

    const decisionResult = await context.supabase
      .from('procurement_supply_risk_decisions')
      .select('id,product_id,product_code,decision,risk_score,risk_reasons,evidence_snapshot,decided_at')
      .eq('organization_id', context.organizationId)
      .eq('id', outcomeDecisionId)
      .maybeSingle();

    if (decisionResult.error || !decisionResult.data || decisionResult.data.decision !== 'action_required') {
      return NextResponse.json({ error: 'La acción no existe o no corresponde a una acción requerida.' }, { status: 404 });
    }

    const current = await context.supabase.rpc('motil_supply_risk_preview', {
      p_organization_id: context.organizationId,
      p_scope_days: 365,
    });
    if (current.error) {
      return NextResponse.json({ error: 'No fue posible revalidar el riesgo actual.' }, { status: 500 });
    }

    const currentSignal = (current.data?.top_actions || []).find(
      (row: any) => row.product_id === decisionResult.data.product_id,
    );
    const recordedAt = new Date();
    const decidedAt = new Date(decisionResult.data.decided_at);
    const timeToOutcomeMs = Number.isFinite(decidedAt.getTime())
      ? Math.max(0, recordedAt.getTime() - decidedAt.getTime())
      : null;

    const result = await context.supabase
      .from('procurement_supply_risk_outcomes')
      .insert({
        organization_id: context.organizationId,
        decision_id: decisionResult.data.id,
        product_id: decisionResult.data.product_id,
        outcome,
        note: note || null,
        risk_score_before: decisionResult.data.risk_score,
        risk_score_after: currentSignal?.risk_score ?? 0,
        evidence_after: currentSignal || { signal_cleared: true },
        time_to_outcome_ms: timeToOutcomeMs,
        recorded_by: context.userId,
        recorded_at: recordedAt.toISOString(),
      })
      .select('id,decision_id,product_id,outcome,note,risk_score_before,risk_score_after,time_to_outcome_ms,recorded_by,recorded_at')
      .single();

    if (result.error) {
      const duplicate = String(result.error.code || '') === '23505';
      return NextResponse.json(
        { error: duplicate ? 'Esta acción ya tiene un resultado registrado.' : 'No fue posible guardar el resultado.' },
        { status: duplicate ? 409 : 500 },
      );
    }

    return NextResponse.json({
      outcome: result.data,
      sourceModified: false,
      canonicalModified: false,
      purchaseCreated: false,
      message: 'Resultado registrado con evidencia antes/después.',
    });
  }

  if (!productId || !['reviewed','action_required','not_applicable'].includes(decision)) {
    return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
  }
  if (decision === 'action_required' && !ACTION_REASON_CODES.has(reasonCode)) {
    return NextResponse.json({ error: 'Selecciona la acción requerida.' }, { status: 400 });
  }
  if (decision === 'not_applicable' && note.length < 3) {
    return NextResponse.json({ error: 'Indica brevemente por qué no aplica.' }, { status: 400 });
  }

  const current = await context.supabase.rpc('motil_supply_risk_preview', {
    p_organization_id: context.organizationId,
    p_scope_days: 365,
  });
  if (current.error) {
    return NextResponse.json({ error: 'No fue posible revalidar la señal.' }, { status: 500 });
  }

  const candidate = (current.data?.top_actions || []).find((row: any) => row.product_id === productId);
  if (!candidate) {
    return NextResponse.json({ error: 'La señal cambió o ya no requiere revisión. Recarga la bandeja.' }, { status: 409 });
  }

  const result = await context.supabase
    .from('procurement_supply_risk_decisions')
    .insert({
      organization_id: context.organizationId,
      product_id: candidate.product_id,
      product_code: candidate.product_code,
      decision,
      reason_code: decision === 'action_required' ? reasonCode : null,
      note: note || null,
      risk_score: candidate.risk_score,
      risk_reasons: candidate.risk_reasons || [],
      evidence_snapshot: {
        quantity_available: candidate.quantity_available,
        minimum_required: candidate.minimum_required,
        active_required_qty: candidate.active_required_qty,
        active_shortage_qty: candidate.active_shortage_qty,
        active_work_orders: candidate.active_work_orders,
        affected_assets: candidate.affected_assets,
        supplier_count: candidate.supplier_count,
        top_supplier_share: candidate.top_supplier_share,
        purchase_lines: candidate.purchase_lines,
        latest_unit_price: candidate.latest_unit_price,
        median_unit_price: candidate.median_unit_price,
        price_ratio: candidate.price_ratio,
        laudus_matched: candidate.laudus_matched,
      },
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
    })
    .select('id,product_id,product_code,decision,reason_code,note,risk_score,decided_by,decided_at')
    .single();

  if (result.error) {
    console.error('[procurement/supply-risk POST]', result.error);
    return NextResponse.json({ error: 'No fue posible guardar la decisión.' }, { status: 500 });
  }

  return NextResponse.json({
    decision: result.data,
    sourceModified: false,
    canonicalModified: false,
    purchaseCreated: false,
    message: decision === 'action_required'
      ? 'Acción registrada para seguimiento.'
      : decision === 'not_applicable'
        ? 'Señal descartada con motivo.'
        : 'Señal revisada.',
  });
}
