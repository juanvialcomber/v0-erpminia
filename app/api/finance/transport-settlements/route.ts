export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period');

  let query = context.supabase
    .from('transport_settlements')
    .select('id,supplier_id,carrier_name,carrier_rut,period_start,period_end,settlement_type,gross_payable_clp,loans_clp,advance_clp,net_payable_clp,fuel_liters,source_file,source_sheet,source_row,updated_at')
    .eq('organization_id', context.organizationId)
    .order('period_start', { ascending: false })
    .order('carrier_name', { ascending: true })
    .limit(1000);

  if (period && /^\d{4}-\d{2}$/.test(period)) {
    query = query
      .gte('period_start', `${period}-01`)
      .lt('period_start', new Date(`${period}-01T00:00:00Z`).getUTCMonth() === 11
        ? `${Number(period.slice(0, 4)) + 1}-01-01`
        : `${period.slice(0, 5)}${String(Number(period.slice(5, 7)) + 1).padStart(2, '0')}-01`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'No se pudieron cargar las liquidaciones de transportistas' }, { status: 500 });

  const rows = data || [];
  const supplierIds = [...new Set(rows.map((row) => row.supplier_id).filter(Boolean))] as string[];
  const supplierMap = new Map<string, { id: string; name: string; rut: string | null }>();

  if (supplierIds.length) {
    const { data: suppliers, error: suppliersError } = await context.supabase
      .from('suppliers')
      .select('id,name,rut')
      .eq('organization_id', context.organizationId)
      .in('id', supplierIds);
    if (suppliersError) return NextResponse.json({ error: 'No se pudo reconciliar el maestro de transportistas' }, { status: 500 });
    for (const supplier of suppliers || []) supplierMap.set(supplier.id, supplier);
  }

  const items = rows.map((row) => ({
    ...row,
    supplier: row.supplier_id ? supplierMap.get(row.supplier_id) || null : null,
  }));

  const periodKeys = [...new Set(items.map((row) => String(row.period_start || '').slice(0, 7)).filter(Boolean))].sort().reverse();

  return NextResponse.json({
    items,
    periods: periodKeys,
    summary: {
      settlements: items.length,
      linked_suppliers: items.filter((row) => Boolean(row.supplier_id)).length,
      unlinked_suppliers: items.filter((row) => !row.supplier_id).length,
      net_payable_clp: items.reduce((sum, row) => sum + Number(row.net_payable_clp || 0), 0),
      gross_payable_clp: items.reduce((sum, row) => sum + Number(row.gross_payable_clp || 0), 0),
      loans_clp: items.reduce((sum, row) => sum + Number(row.loans_clp || 0), 0),
      advances_clp: items.reduce((sum, row) => sum + Number(row.advance_clp || 0), 0),
      fuel_liters: items.reduce((sum, row) => sum + Number(row.fuel_liters || 0), 0),
    },
    readOnly: true,
    semantics: 'Liquidaciones reconstruidas desde la planilla histórica de Elías. No constituyen una instrucción de pago ni reemplazan la conciliación financiera.',
  });
}
