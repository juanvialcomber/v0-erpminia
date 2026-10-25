export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const managementRoles = new Set(['superadmin', 'admin', 'manager']);

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const role = String(context.role || '').trim().toLowerCase();
  if (!managementRoles.has(role)) {
    const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
    if (!access.authorized) return access.response;
  }

  try {
    const [current, history, financeReviews] = await Promise.all([
      context.supabase.rpc('motil_value_scorecard_preview', {
        p_organization_id: context.organizationId,
      }),
      context.supabase.rpc('motil_value_scorecard_history_preview', {
        p_organization_id: context.organizationId,
        p_limit: 90,
      }),
      context.supabase
        .from('laudus_finance_review_feedback_service_v1')
        .select('decision,created_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    if (current.error) throw current.error;
    if (history.error) throw history.error;
    if (financeReviews.error) throw financeReviews.error;

    const financeRows = financeReviews.data || [];
    const financeReview = {
      total: financeRows.length,
      reviewed: financeRows.filter((row: any) => row.decision === 'accepted').length,
      deferred: financeRows.filter((row: any) => row.decision === 'deferred').length,
      rejected: financeRows.filter((row: any) => row.decision === 'rejected').length,
      latestAt: financeRows[0]?.created_at || null,
    };

    return NextResponse.json({
      current: current.data || null,
      financeReview,
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
