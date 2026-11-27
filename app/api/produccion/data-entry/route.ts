export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { validatePlantEntry } from '@/lib/production/plant-entry-validation.mjs';

type TransportBody = {
  mode: 'mineral_transport';
  movementDate: string;
  movementNumber?: string;
  client?: string;
  description?: string;
  driver?: string;
  carrier?: string;
  plate?: string;
  sector?: string;
  mineOrigin?: string;
  interiorMine?: string;
  sealNumber?: string;
  netWeight: number;
  debtStatus?: string;
};

type PlantBody = {
  mode: 'plant_metallurgy';
  operationDate: string;
  shiftCode: string;
  treatedWetMetricTons: number;
  mineralMoisturePct: number;
  headGrade: number;
  concentrateGrade?: number | null;
  tailingsGrade?: number | null;
  galigherGrade?: number | null;
  concentrateWetMetricTons?: number | null;
  concentrateMoisturePct?: number | null;
  dispatchedMetricTons?: number | null;
  dispatchMoisturePct?: number | null;
  dispatchGrade?: number | null;
  lotNumber?: string | null;
  blendCode?: string | null;
};

type Body = TransportBody | PlantBody;

type NormalizationRule = {
  effective_from: string | null;
  effective_to: string | null;
};

function appliesToDate(rule: NormalizationRule, date: string) {
  return (!rule.effective_from || date >= rule.effective_from) &&
    (!rule.effective_to || date <= rule.effective_to);
}

function finite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.PROD_OPERACIONES, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = (await request.json()) as Body;
  if (!body?.mode) return NextResponse.json({ error: 'mode es obligatorio' }, { status: 400 });

  let rpcPayload: Body = body;
  try {
    if (body.mode === 'mineral_transport') {
      const rawQuantity = finite(body.netWeight);
      if (!body.movementDate || rawQuantity === null || rawQuantity <= 0) {
        return NextResponse.json({ error: 'Fecha y tonelaje/peso neto válido son obligatorios' }, { status: 400 });
      }

      // Keep the friendly API-level validation, while the RPC re-checks the
      // normalization rule inside the same transaction as the production write.
      const { data: rules, error: rulesError } = await context.supabase
        .from('production_normalization_rules')
        .select('effective_from, effective_to')
        .eq('organization_id', context.organizationId)
        .eq('source_type', 'tm')
        .eq('status', 'approved');
      if (rulesError) throw new Error(rulesError.message);

      const hasApplicableRule = (rules || []).some((candidate) =>
        appliesToDate(candidate as NormalizationRule, body.movementDate)
      );
      if (!hasApplicableRule) {
        return NextResponse.json({ error: `No existe regla TM aprobada para ${body.movementDate}` }, { status: 400 });
      }
    } else if (body.mode === 'plant_metallurgy') {
      const checked = validatePlantEntry(body);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: 400 });
      }
      rpcPayload = checked.payload as PlantBody;
    } else {
      return NextResponse.json({ error: 'mode inválido' }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc('create_production_manual_entry_v1', {
      p_organization_id: context.organizationId,
      p_actor_id: context.userId,
      p_mode: body.mode,
      p_payload: rpcPayload,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No fue posible confirmar el ingreso de producción');

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No fue posible guardar el ingreso' }, { status: 500 });
  }
}
