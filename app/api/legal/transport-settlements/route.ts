export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const { data: latestRows, error: latestError } = await context.supabase
    .from('transport_settlements_canonical_v1')
    .select('period_start,period_end,source_sheet')
    .eq('organization_id', context.organizationId)
    .order('period_end', { ascending: false })
    .limit(1);

  if (latestError) return NextResponse.json({ error: 'No se pudo resolver el último período de transportistas' }, { status: 503 });
  const latest = latestRows?.[0];
  if (!latest) return NextResponse.json({ data: [], summary: null, period: null });

  const { data: settlements, error } = await context.supabase
    .from('transport_settlements_canonical_v1')
    .select('id,carrier_name,carrier_rut,period_start,period_end,settlement_type,gross_payable_clp,loans_clp,advance_clp,net_payable_clp,fuel_liters,source_file,source_sheet,source_row')
    .eq('organization_id', context.organizationId)
    .eq('period_start', latest.period_start)
    .eq('period_end', latest.period_end)
    .order('source_row');

  if (error) return NextResponse.json({ error: 'No se pudieron cargar liquidaciones de transportistas' }, { status: 503 });

  const valid = (settlements || []).filter((row) => {
    const hasIdentity = Boolean(String(row.carrier_rut || '').trim());
    const hasMoney = [row.gross_payable_clp,row.advance_clp,row.net_payable_clp].some((value) => Math.abs(Number(value || 0)) > 0.001);
    return hasIdentity && hasMoney && String(row.carrier_name || '').trim().toLowerCase() !== 'transportista';
  });

  const ids = valid.map((row) => row.id);
  const { data: components, error: componentError } = ids.length
    ? await context.supabase
        .from('transport_settlement_components_canonical_v1')
        .select('settlement_id,component_type,component_key,quantity,unit,unit_rate_clp,amount_clp,source_cell')
        .eq('organization_id', context.organizationId)
        .in('settlement_id', ids)
        .limit(5000)
    : { data: [], error: null };

  if (componentError) return NextResponse.json({ error: 'No se pudieron cargar componentes de liquidación' }, { status: 503 });

  const bySettlement = new Map<string, any[]>();
  for (const component of components || []) {
    const id=String(component.settlement_id);
    const list=bySettlement.get(id) || [];
    list.push(component);
    bySettlement.set(id,list);
  }

  const data = valid.map((row) => ({
    ...row,
    components: bySettlement.get(String(row.id)) || [],
  }));

  return NextResponse.json({
    data,
    period: {
      start: latest.period_start,
      end: latest.period_end,
      source_sheet: latest.source_sheet,
    },
    summary: {
      carriers: data.length,
      gross_payable_clp: data.reduce((sum,row)=>sum+Number(row.gross_payable_clp||0),0),
      loans_clp: data.reduce((sum,row)=>sum+Number(row.loans_clp||0),0),
      advances_clp: data.reduce((sum,row)=>sum+Number(row.advance_clp||0),0),
      net_payable_clp: data.reduce((sum,row)=>sum+Number(row.net_payable_clp||0),0),
      fuel_liters: data.reduce((sum,row)=>sum+Number(row.fuel_liters||0),0),
    },
    policy: {
      source: 'transport_settlements_canonical_v1',
      rule: 'La vista usa la capa canónica deduplicada y excluye filas sin RUT o sin montos operacionales. No elimina registros fuente.',
      payment: 'Líquido a pago es una liquidación calculada; no significa transferencia ejecutada.',
    },
  });
}
