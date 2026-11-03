export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import {
  getLaudusConfigurationState,
  LaudusApiError,
  runLaudusReadOnlySmokeTest,
} from '@/lib/integrations/laudus/client';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const SMOKE_MAX_API_REQUESTS = 19;

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible.' }, { status: 400 });
  }
  if (!access.admin) {
    return NextResponse.json(
      { error: 'La prueba Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const configuration = getLaudusConfigurationState();
  if (!configuration.configured) {
    return NextResponse.json(
      {
        status: 'pending_configuration',
        configured: false,
        missing: configuration.missing,
        calls: 0,
        persisted: false,
      },
      { status: 503 },
    );
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: budget, error: budgetError } = await supabase
      .from('laudus_api_budget_service_v1')
      .select('tracked_remaining,monthly_remaining_exact,tracking_status')
      .eq('organization_id', access.organizationId)
      .maybeSingle();

    if (budgetError || !budget || budget.monthly_remaining_exact !== true || budget.tracked_remaining == null) {
      return NextResponse.json(
        {
          status: 'budget_unknown',
          configured: true,
          calls: 0,
          persisted: false,
          requiredHeadroom: SMOKE_MAX_API_REQUESTS,
          error: 'No fue posible verificar el margen mensual de llamadas Laudus.',
        },
        { status: 503 },
      );
    }

    if (Number(budget.tracked_remaining) < SMOKE_MAX_API_REQUESTS) {
      return NextResponse.json(
        {
          status: 'budget_hold',
          configured: true,
          calls: 0,
          persisted: false,
          requiredHeadroom: SMOKE_MAX_API_REQUESTS,
          trackedRemaining: Number(budget.tracked_remaining),
          error: 'La prueba fue bloqueada para preservar el presupuesto mensual Laudus.',
        },
        { status: 429 },
      );
    }

    const result = await withLaudusApiUsageTracking(access.organizationId, () => runLaudusReadOnlySmokeTest());
    return NextResponse.json({
      configured: true,
      ...result,
    });
  } catch (error) {
    const laudusError = error instanceof LaudusApiError ? error : null;
    console.error('[laudus/smoke]', laudusError
      ? { status: laudusError.status, path: laudusError.path, upstreamCode: laudusError.upstreamCode }
      : error instanceof Error ? error.message : 'Unknown Laudus error');
    return NextResponse.json(
      {
        status: 'failed',
        configured: true,
        calls: null,
        persisted: false,
        stage: laudusError?.path || null,
        upstreamStatus: laudusError?.status || null,
        upstreamCode: laudusError?.upstreamCode || null,
        error: error instanceof Error ? error.message : 'No fue posible validar Laudus.',
      },
      { status: 502 },
    );
  }
}

