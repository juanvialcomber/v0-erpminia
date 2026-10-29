export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data, error } = await context.supabase
      .schema('intelligence')
      .from('work_order_supply_status')
      .select('*')
      .eq('organization_id', context.organizationId)
      .in('supply_status', ['open', 'pending', 'ready_for_procurement'])
      .gt('shortage_lines', 0)
      .order('required_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const needs = data || [];
    const productIds = [...new Set(needs.flatMap((need: any) =>
      Array.isArray(need.materials)
        ? need.materials.map((material: any) => String(material.product_id || '')).filter(Boolean)
        : [],
    ))].slice(0, 50);

    const needIds = needs.map((need: any) => String(need.supply_need_id || '')).filter(Boolean).slice(0, 100);

    const [stockResult, authorityResult, decisionResult] = await Promise.all([
      productIds.length
        ? context.supabase
            .from('laudus_inventory_reconciliation_service_v1')
            .select('canonical_product_id,laudus_stock,laudus_synced_at')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
            .limit(100)
        : Promise.resolve({ data: [], error: null } as any),
      context.supabase
        .from('bodega_stock_source_authority_service_v1')
        .select('authority_state,authority_reason,latest_laudus_stock_sync')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      needIds.length
        ? context.supabase
            .from('audit_log')
            .select('resource_identifier,new_values,created_at,user_id')
            .eq('organization_id', context.organizationId)
            .eq('action', 'supply_need_no_purchase_decision')
            .eq('resource_type', 'work_order_supply_need')
            .in('resource_identifier', needIds)
            .order('created_at', { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (stockResult.error) throw stockResult.error;
    if (authorityResult.error) throw authorityResult.error;
    if (decisionResult.error) throw decisionResult.error;

    const decisionByNeed = new Map<string, any>();
    for (const row of decisionResult.data || []) {
      const key = String(row.resource_identifier || '');
      if (key && !decisionByNeed.has(key)) decisionByNeed.set(key, row);
    }

    const stockByProduct = new Map<string, { laudus_stock?: number | string | null }>(
      (stockResult.data || []).map((row: any) => [String(row.canonical_product_id || ''), row]),
    );
    const laudusPrimary = authorityResult.data?.authority_state === 'laudus_primary';

    const decoratedNeeds = needs.map((need: any) => {
      const materials = Array.isArray(need.materials) ? need.materials : [];
      const shortageMaterials = materials.filter((material: any) => Number(material.shortage || 0) > 0);
      const coveredLines = shortageMaterials.filter((material: any) => {
        const current = stockByProduct.get(String(material.product_id || ''));
        return Number(current?.laudus_stock || 0) >= Number(material.shortage || 0);
      }).length;
      return {
        ...need,
        current_stock_review: {
          source: laudusPrimary ? 'laudus_primary' : 'review_required',
          covered_lines: coveredLines,
          shortage_lines: shortageMaterials.length,
          all_covered_now: laudusPrimary && shortageMaterials.length > 0 && coveredLines === shortageMaterials.length,
          latest_laudus_stock_sync: authorityResult.data?.latest_laudus_stock_sync || null,
          authority_reason: authorityResult.data?.authority_reason || null,
        },
        no_purchase_decision: decisionByNeed.get(String(need.supply_need_id || '')) || null,
      };
    });

    return NextResponse.json({ needs: decoratedNeeds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar las necesidades de abastecimiento';
    return NextResponse.json({ needs: [], error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = (await request.json()) as { supplyNeedId?: string; action?: 'send_to_procurement' | 'confirm_no_purchase' };
    if (!body.supplyNeedId) {
      return NextResponse.json({ error: 'Falta la necesidad de abastecimiento' }, { status: 400 });
    }

    const { data: currentNeed, error: needError } = await context.supabase
      .schema('intelligence')
      .from('work_order_supply_status')
      .select('supply_need_id,procurement_request_id,materials,shortage_lines')
      .eq('organization_id', context.organizationId)
      .eq('supply_need_id', body.supplyNeedId)
      .maybeSingle();

    if (needError) throw needError;
    if (!currentNeed) {
      return NextResponse.json({ error: 'La necesidad ya no está disponible.' }, { status: 409 });
    }
    if (currentNeed.procurement_request_id) {
      return NextResponse.json({ error: 'La necesidad ya fue enviada a Compras.' }, { status: 409 });
    }

    const materials = Array.isArray(currentNeed.materials) ? currentNeed.materials : [];
    const shortageMaterials = materials.filter((material: any) => Number(material.shortage || 0) > 0);
    const productIds = [...new Set(shortageMaterials.map((material: any) => String(material.product_id || '')).filter(Boolean))].slice(0, 50);

    const [stockResult, authorityResult] = await Promise.all([
      productIds.length
        ? context.supabase
            .from('laudus_inventory_reconciliation_service_v1')
            .select('canonical_product_id,laudus_stock,laudus_synced_at')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
            .limit(100)
        : Promise.resolve({ data: [], error: null } as any),
      context.supabase
        .from('bodega_stock_source_authority_service_v1')
        .select('authority_state,authority_reason,latest_laudus_stock_sync')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
    ]);

    if (stockResult.error) throw stockResult.error;
    if (authorityResult.error) throw authorityResult.error;

    const stockByProduct = new Map<string, { laudus_stock?: number | string | null }>(
      (stockResult.data || []).map((row: any) => [String(row.canonical_product_id || ''), row]),
    );
    const allCoveredNow = shortageMaterials.length > 0 && shortageMaterials.every((material: any) => {
      const current = stockByProduct.get(String(material.product_id || ''));
      return Number(current?.laudus_stock || 0) >= Number(material.shortage || 0);
    });

    const laudusPrimary = authorityResult.data?.authority_state === 'laudus_primary';

    if (body.action === 'confirm_no_purchase') {
      if (!laudusPrimary || !allCoveredNow) {
        return NextResponse.json({ error: 'La evidencia actual no permite registrar una decisión de no compra.' }, { status: 409 });
      }

      const { data: costRows, error: costError } = productIds.length
        ? await context.supabase
            .from('product_procurement_status')
            .select('product_id,weighted_average_unit_cost,purchase_order_count')
            .eq('organization_id', context.organizationId)
            .in('product_id', productIds)
            .limit(50)
        : { data: [], error: null } as any;
      if (costError) throw costError;

      const costByProduct = new Map<string, { weighted_average_unit_cost?: number | string | null }>(
        (costRows || []).map((row: any) => [String(row.product_id || ''), row]),
      );
      const estimatedExposureClp = shortageMaterials.reduce((sum: number, material: any) => {
        const cost = Number(costByProduct.get(String(material.product_id || ''))?.weighted_average_unit_cost);
        return Number.isFinite(cost) ? sum + (Number(material.shortage || 0) * cost) : sum;
      }, 0);

      const { error: auditError } = await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'supply_need_no_purchase_decision',
        resource_type: 'work_order_supply_need',
        resource_identifier: body.supplyNeedId,
        new_values: {
          decision: 'no_purchase_reconcile_stock',
          shortage_lines: shortageMaterials.length,
          source_authority: authorityResult.data?.authority_state || null,
          latest_laudus_stock_sync: authorityResult.data?.latest_laudus_stock_sync || null,
          estimated_exposure_clp: estimatedExposureClp,
          exposure_semantics: 'historical weighted-average replacement exposure; not realized savings or avoided cost until the outcome is closed',
          evidence: shortageMaterials.map((material: any) => {
            const current = stockByProduct.get(String(material.product_id || ''));
            return {
              product_id: material.product_id || null,
              product_code: material.product_code || null,
              shortage: Number(material.shortage || 0),
              laudus_stock: Number(current?.laudus_stock || 0),
            };
          }),
          semantics: 'human decision to avoid procurement and reconcile an already-covered historical shortage; does not close canonical supply need',
        },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      if (auditError) throw auditError;

      return NextResponse.json({ ok: true, decision: 'no_purchase_reconcile_stock' });
    }

    if (laudusPrimary && allCoveredNow) {
      return NextResponse.json({
        error: 'El faltante histórico ya está cubierto por stock Laudus. Concilia la necesidad antes de generar una compra.',
        code: 'SUPPLY_NEED_ALREADY_COVERED',
        review: {
          shortageLines: shortageMaterials.length,
          latestLaudusStockSync: authorityResult.data?.latest_laudus_stock_sync || null,
          authorityReason: authorityResult.data?.authority_reason || null,
        },
      }, { status: 409 });
    }

    const { data: userData } = await context.supabase.auth.getUser();
    const requestedByName = userData.user?.user_metadata?.full_name
      || userData.user?.user_metadata?.name
      || userData.user?.email
      || null;

    const { data, error } = await context.supabase.rpc('convert_supply_need_to_intake_request', {
      p_supply_need_id: body.supplyNeedId,
      p_requested_by: context.userId,
      p_requested_by_name: requestedByName,
    });

    if (error) throw error;

    const { data: intake, error: intakeError } = await context.supabase
      .from('procurement_intake_flow')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('id', data)
      .single();

    if (intakeError) throw intakeError;

    return NextResponse.json({ intake }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la solicitud operativa';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
