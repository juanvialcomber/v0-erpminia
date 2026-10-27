export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function text(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { error: prepareError } = await context.supabase.rpc('motil_prepare_asset_creation_requests', {
    p_organization_id: context.organizationId,
  });
  if (prepareError) return NextResponse.json({ error: 'No se pudo preparar la cola de alta.' }, { status: 500 });

  const { data, error } = await context.supabase
    .from('asset_creation_requests')
    .select('id,reconciliation_review_id,candidate_key,state,proposed_asset_code,canonical_asset_id,source_snapshot,conflict_reason,created_at,updated_at')
    .eq('organization_id', context.organizationId)
    .neq('state', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: 'No se pudo leer la cola de alta.' }, { status: 500 });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: (data || []).length,
      awaitingCode: (data || []).filter((row: any) => row.state === 'awaiting_code').length,
      readyToCreate: (data || []).filter((row: any) => row.state === 'ready_to_create').length,
      created: (data || []).filter((row: any) => row.state === 'created').length,
      conflicts: (data || []).filter((row: any) => row.state === 'conflict').length,
    },
    requests: data || [],
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const requestId = text(body?.requestId);
  const assetCode = text(body?.assetCode)?.toUpperCase();

  if (!requestId || !assetCode || assetCode.length > 80) {
    return NextResponse.json({ error: 'Código de activo inválido.' }, { status: 400 });
  }

  const { data: existingCanonical, error: canonicalError } = await context.supabase
    .schema('canonical')
    .from('assets')
    .select('id,asset_code')
    .eq('organization_id', context.organizationId)
    .eq('asset_code', assetCode)
    .maybeSingle();

  if (canonicalError) return NextResponse.json({ error: 'No se pudo validar el código.' }, { status: 500 });
  if (existingCanonical) {
    return NextResponse.json({ error: 'Ese código ya existe en el maestro de activos.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data, error } = await context.supabase
    .from('asset_creation_requests')
    .update({
      proposed_asset_code: assetCode,
      state: 'ready_to_create',
      code_assigned_by: context.userId,
      code_assigned_at: now,
      conflict_reason: null,
      updated_at: now,
    })
    .eq('organization_id', context.organizationId)
    .eq('id', requestId)
    .in('state', ['awaiting_code','ready_to_create','conflict'])
    .select('id,candidate_key,state,proposed_asset_code,updated_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese código ya está reservado para otra alta.' }, { status: 409 });
    return NextResponse.json({ error: 'No se pudo asignar el código.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Solicitud no disponible para asignación.' }, { status: 409 });

  return NextResponse.json({ request: data });
}
