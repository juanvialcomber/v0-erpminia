export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.FIN_FINANZAS);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Finanzas' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('transport_settlements_canonical_v1')
    .select('id,supplier_id,carrier_name,carrier_rut,period_start,period_end,settlement_type,gross_payable_clp,loans_clp,advance_clp,net_payable_clp,fuel_liters,source_sheet,source_row,source_fingerprint')
    .eq('organization_id', context.organizationId)
    .order('period_end', { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const byCarrier = new Map<string, {
    carrier_name:string;
    carrier_rut:string|null;
    supplier_id:string|null;
    settlements:number;
    gross:number;
    net:number;
    loans:number;
    advance:number;
    fuel_liters:number;
    first_period:string|null;
    last_period:string|null;
  }>();
  const byMonth = new Map<string,{period:string;settlements:number;net:number;fuel_liters:number}>();

  for (const row of rows) {
    const carrierKey = row.carrier_rut || row.supplier_id || row.carrier_name;
    const current = byCarrier.get(carrierKey) || {
      carrier_name: row.carrier_name,
      carrier_rut: row.carrier_rut,
      supplier_id: row.supplier_id,
      settlements: 0,
      gross: 0,
      net: 0,
      loans: 0,
      advance: 0,
      fuel_liters: 0,
      first_period: row.period_start,
      last_period: row.period_end,
    };
    current.settlements += 1;
    current.gross += Number(row.gross_payable_clp || 0);
    current.net += Number(row.net_payable_clp || 0);
    current.loans += Number(row.loans_clp || 0);
    current.advance += Number(row.advance_clp || 0);
    current.fuel_liters += Number(row.fuel_liters || 0);
    if (row.period_start && (!current.first_period || row.period_start < current.first_period)) current.first_period = row.period_start;
    if (row.period_end && (!current.last_period || row.period_end > current.last_period)) current.last_period = row.period_end;
    byCarrier.set(carrierKey, current);

    const period = row.period_start ? String(row.period_start).slice(0, 7) : 'sin-periodo';
    const month = byMonth.get(period) || { period, settlements: 0, net: 0, fuel_liters: 0 };
    month.settlements += 1;
    month.net += Number(row.net_payable_clp || 0);
    month.fuel_liters += Number(row.fuel_liters || 0);
    byMonth.set(period, month);
  }

  const carriers = Array.from(byCarrier.values()).sort((a, b) => b.net - a.net);
  const months = Array.from(byMonth.values()).sort((a, b) => b.period.localeCompare(a.period));

  return NextResponse.json({
    data: rows.slice(0, 250),
    carriers,
    months,
    summary: {
      settlements: rows.length,
      canonical_carriers: carriers.length,
      net_total_clp: rows.reduce((sum, row) => sum + Number(row.net_payable_clp || 0), 0),
      gross_total_clp: rows.reduce((sum, row) => sum + Number(row.gross_payable_clp || 0), 0),
      fuel_liters: rows.reduce((sum, row) => sum + Number(row.fuel_liters || 0), 0),
      resolved_supplier_rows: rows.filter((row) => Boolean(row.supplier_id)).length,
      explicit_rut_unresolved: rows.filter((row) => Boolean(row.carrier_rut) && !row.supplier_id).length,
      no_rut_rows: rows.filter((row) => !row.carrier_rut).length,
      first_period: rows.reduce<string | null>((min, row) => !row.period_start ? min : !min || row.period_start < min ? row.period_start : min, null),
      last_period: rows.reduce<string | null>((max, row) => !row.period_end ? max : !max || row.period_end > max ? row.period_end : max, null),
    },
    lineage: {
      table: 'transport_settlements_canonical_v1',
      note: 'Sólo liquidaciones con lineage derived_from/promoted. Los 566 duplicados legacy quedan fuera de esta proyección y permanecen auditables.',
    },
    accessLevel: access,
  });
}
