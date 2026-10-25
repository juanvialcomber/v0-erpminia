export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
const managementRoles = new Set(['superadmin', 'admin']);

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const role = String(context.role || '').trim().toLowerCase();
  if (!managementRoles.has(role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const [current, history, financeReviews, financeTiming] = await Promise.all([
      context.supabase.rpc('motil_value_scorecard_preview', {
        p_organization_id: context.organizationId,
      }),
      context.supabase.rpc('motil_value_scorecard_history_preview', {
        p_organization_id: context.organizationId,
        p_limit: 90,
      }),
      context.supabase
        .from('laudus_finance_review_feedback_service_v1')
        .select('purchase_invoice_external_id,decision,outstanding_amount,created_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('audit_log')
        .select('resource_identifier,new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'finance_review_decision')
        .eq('resource_type', 'laudus_purchase_invoice')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (current.error) throw current.error;
    if (history.error) throw history.error;
    if (financeReviews.error) throw financeReviews.error;
    if (financeTiming.error) throw financeTiming.error;

    const financeRows = financeReviews.data || [];
    const latestFinanceReviews = new Map<string, any>();
    for (const row of financeRows) {
      const key = String(row.purchase_invoice_external_id || '');
      if (key && !latestFinanceReviews.has(key)) latestFinanceReviews.set(key, row);
    }
    const financeReviewRows = Array.from(latestFinanceReviews.values());
    const reviewedAmountClp = financeReviewRows.reduce(
      (sum: number, row: any) => sum + (Number.isFinite(Number(row.outstanding_amount)) ? Number(row.outstanding_amount) : 0),
      0,
    );
    const acceptedAmountClp = financeReviewRows
      .filter((row: any) => row.decision === 'accepted')
      .reduce(
        (sum: number, row: any) => sum + (Number.isFinite(Number(row.outstanding_amount)) ? Number(row.outstanding_amount) : 0),
        0,
      );

    const financeReview = {
      total: financeReviewRows.length,
      reviewed: financeReviewRows.filter((row: any) => row.decision === 'accepted').length,
      deferred: financeReviewRows.filter((row: any) => row.decision === 'deferred').length,
      rejected: financeReviewRows.filter((row: any) => row.decision === 'rejected').length,
      reviewedAmountClp,
      acceptedAmountClp,
      latestAt: financeRows[0]?.created_at || null,
      calibrationGate: financeReviewRows.length >= 20 ? 'PASS' : 'HOLD',
      semantics: 'amount reviewed is value under human control, not savings or avoided cost',
    };

    const latestTimingByInvoice = new Map<string, number>();
    for (const row of financeTiming.data || []) {
      const key = String(row.resource_identifier || '');
      const latency = Number((row.new_values as any)?.decision_latency_ms);
      if (key && Number.isFinite(latency) && latency >= 0 && !latestTimingByInvoice.has(key)) {
        latestTimingByInvoice.set(key, latency);
      }
    }
    const timingValues = Array.from(latestTimingByInvoice.values()).sort((a, b) => a - b);
    const midpoint = Math.floor(timingValues.length / 2);
    const medianMs =
      timingValues.length === 0
        ? null
        : timingValues.length % 2 === 0
          ? Math.round((timingValues[midpoint - 1] + timingValues[midpoint]) / 2)
          : timingValues[midpoint];
    const financeReviewTiming = {
      sample: timingValues.length,
      medianSeconds: medianMs === null ? null : Math.round(medianMs / 1000),
      semantics: 'time from finance cockpit load to human decision; not manual baseline',
    };

    return NextResponse.json({
      current: current.data || null,
      financeReview,
      financeReviewTiming,
      history: history.data || null,
      definitions: {
        workflow: {
          L1: 'Conectividad',
          L2: 'Visibilidad operacional',
          L3: 'Inteligencia',
          L4: 'Decisión asistida',
          L5: 'Autonomía controlada',
        },
        evidence: {
          E0: 'Narrativa',
          E1: 'Volumen y cobertura',
          E2: 'Desempeño medido',
          E3: 'Impacto observado',
          E4: 'Valor recurrente',
        },
      },
    });
  } catch (error) {
    console.error('[value/scorecard]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar el scorecard de valor' },
      { status: 500 },
    );
  }
}
