export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

const decisions = new Set(['confirmed','dismissed','monitor']);

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED') return NextResponse.json({ error: 'Sólo planificación puede revisar señales de condición.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const signalKey = String(body?.signalKey || '').trim();
  const assetId = String(body?.assetId || '').trim();
  const signalType = String(body?.signalType || '').trim();
  const decision = String(body?.decision || '').trim();
  if (!signalKey || !assetId || !signalType || !decisions.has(decision)) {
    return NextResponse.json({ error: 'Revisión inválida.' }, { status: 400 });
  }

  const { data: asset, error: assetError } = await context.supabase
    .from('maintenance_canonical_assets_v1')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('id', assetId)
    .maybeSingle();
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'Equipo no encontrado.' }, { status: 404 });

  const { data, error } = await context.supabase
    .from('maintenance_condition_signal_reviews')
    .upsert({
      organization_id: context.organizationId,
      signal_key: signalKey,
      canonical_asset_id: assetId,
      signal_type: signalType,
      decision,
      decision_note: body?.decisionNote ? String(body.decisionNote).trim() : null,
      evidence_snapshot: body?.evidenceSnapshot && typeof body.evidenceSnapshot === 'object' ? body.evidenceSnapshot : {},
      reviewed_by: context.authUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,signal_key' })
    .select('signal_key,decision,decision_note,reviewed_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    canonicalStateMutated: false,
    workOrderCreated: false,
  });
}
