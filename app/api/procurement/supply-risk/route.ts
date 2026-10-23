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

  const productIds = Array.isArray(data?.top_actions)
    ? data.top_actions.map((row: any) => row.product_id).filter(Boolean)
    : [];

  let decisions: any[] = [];
  if (productIds.length) {
    const result = await context.supabase
      .from('procurement_supply_risk_decisions')
      .select('id,product_id,product_code,decision,reason_code,note,risk_score,risk_reasons,decided_by,decided_at')
      .eq('organization_id', context.organizationId)
      .in('product_id', productIds)
      .order('decided_at', { ascending: false })
      .limit(200);
    if (result.error) {
      console.error('[procurement/supply-risk decisions]', result.error);
      return NextResponse.json({ error: 'No fue posible cargar las decisiones de abastecimiento.' }, { status: 500 });
    }
    decisions = result.data || [];
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

  const actionRequired = decisions.filter((row) => row.decision === 'action_required').length;
  const reviewed = decisions.filter((row) => row.decision === 'reviewed').length;
  const notApplicable = decisions.filter((row) => row.decision === 'not_applicable').length;

  return NextResponse.json({
    ...data,
    pending: pending.slice(0, 12),
    decisions: decisions.slice(0, 12),
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
  const productId = String(body?.productId || '').trim();
  const decision = String(body?.decision || '').trim();
  const reasonCode = String(body?.reasonCode || '').trim();
  const note = String(body?.note || '').trim();

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
