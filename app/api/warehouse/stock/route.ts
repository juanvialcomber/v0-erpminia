export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext, type OrganizationSuccessContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { isStockBelowMinimum } from '@/lib/inventory-alerts';

type WarehouseZoneRow = {
  id: string;
  zone_code: string | null;
  zone_name: string | null;
};

type WarehouseRackRow = {
  id: string;
  zone_id: string | null;
  rack_code: string | null;
  rack_name: string | null;
};

type WarehouseBinRow = {
  id: string;
  rack_id: string | null;
  bin_code: string | null;
  bin_location: string | null;
  current_stock: number | string | null;
  capacity_units: number | string | null;
};

type WarehouseStockRow = {
  id: string;
  part_id: string | null;
  part_code: string | null;
  part_name: string | null;
  quantity_on_hand: number | string | null;
  quantity_reserved: number | string | null;
  quantity_available: number | string | null;
  reorder_level: number | string | null;
  reorder_quantity: number | string | null;
  unit_cost: number | string | null;
  last_counted_date: string | null;
  expiry_date: string | null;
  batch_number: string | null;
  supplier_lot: string | null;
  bin_id: string | null;
  bin?: {
    id: string | null;
    bin_code: string | null;
    bin_location: string | null;
  } | null;
};

type BinLabelRow = {
  id: string;
  rack_id: string | null;
  bin_code: string | null;
  bin_location: string | null;
  current_stock: number;
  capacity_units: number;
  rack_code: string | null;
  rack_name: string | null;
  zone_code: string | null;
  zone_name: string | null;
  label: string;
};

type StockItem = {
  id: string;
  part_code: string | null;
  part_name: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_level: number;
  reorder_quantity: number;
  unit_cost: number;
  total_value: number;
  bin_location: string;
  is_low_stock: boolean;
  is_critical: boolean;
};

async function getOrganizationBins(
  supabase: OrganizationSuccessContext['supabase'],
  organizationId: string
): Promise<BinLabelRow[]> {
  const { data: zones, error: zonesError } = await supabase
    .from('warehouse_zones')
    .select('id, zone_code, zone_name')
    .eq('organization_id', organizationId)
    .order('zone_code', { ascending: true });

  if (zonesError) throw zonesError;

  const zoneRows = Array.isArray(zones) ? (zones as WarehouseZoneRow[]) : [];
  const zoneIds = zoneRows.map((zone) => zone.id);
  if (zoneIds.length === 0) return [];

  const { data: racks, error: racksError } = await supabase
    .from('warehouse_racks')
    .select('id, zone_id, rack_code, rack_name')
    .in('zone_id', zoneIds)
    .order('rack_code', { ascending: true });

  if (racksError) throw racksError;

  const rackRows = Array.isArray(racks) ? (racks as WarehouseRackRow[]) : [];
  const rackIds = rackRows.map((rack) => rack.id);
  if (rackIds.length === 0) return [];

  const { data: bins, error: binsError } = await supabase
    .from('warehouse_bins')
    .select('id, rack_id, bin_code, bin_location, current_stock, capacity_units')
    .in('rack_id', rackIds)
    .order('bin_location', { ascending: true });

  if (binsError) throw binsError;

  const zonesById = new Map(zoneRows.map((zone) => [zone.id, zone] as const));
  const racksById = new Map(rackRows.map((rack) => [rack.id, rack] as const));
  const binRows = Array.isArray(bins) ? (bins as WarehouseBinRow[]) : [];

  return binRows.map((bin) => {
    const rack = bin.rack_id ? racksById.get(bin.rack_id) || null : null;
    const zone = rack?.zone_id ? zonesById.get(rack.zone_id) || null : null;

    return {
      ...bin,
      current_stock: Number(bin.current_stock || 0),
      capacity_units: Number(bin.capacity_units || 0),
      rack_code: rack?.rack_code || null,
      rack_name: rack?.rack_name || null,
      zone_code: zone?.zone_code || null,
      zone_name: zone?.zone_name || null,
      label:
        bin.bin_location ||
        [zone?.zone_code, rack?.rack_code, bin.bin_code].filter(Boolean).join('-'),
    };
  });
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const binId = searchParams.get('binId');
    const partCode = searchParams.get('partCode');

    let query = context.supabase
      .from('warehouse_stock')
      .select('*, bin:warehouse_bins(id, bin_code, bin_location)')
      .eq('organization_id', context.organizationId)
      .order('part_name', { ascending: true });

    if (binId) query = query.eq('bin_id', binId);
    if (partCode) query = query.ilike('part_code', `%${partCode}%`);

    const [{ data: stock, error: stockError }, bins] = await Promise.all([
      query,
      getOrganizationBins(context.supabase, context.organizationId),
    ]);

    if (stockError) throw stockError;

    const stockRows = (Array.isArray(stock) ? (stock as WarehouseStockRow[]) : []).map((item) => {
      const quantityOnHand = Number(item.quantity_on_hand || 0);
      const quantityReserved = Number(item.quantity_reserved || 0);
      const reorderLevel = Number(item.reorder_level || 0);
      const reorderQuantity = Number(item.reorder_quantity || 0);
      const unitCost = Number(item.unit_cost || 0);

      return {
        ...item,
        quantity_on_hand: quantityOnHand,
        quantity_reserved: quantityReserved,
        quantity_available: Number(item.quantity_available || quantityOnHand - quantityReserved),
        reorder_level: reorderLevel,
        reorder_quantity: reorderQuantity,
        unit_cost: unitCost,
        total_value: quantityOnHand * unitCost,
        bin_location: item.bin?.bin_location || item.bin_id || 'N/A',
        is_low_stock: isStockBelowMinimum(quantityOnHand, reorderLevel),
        is_critical: isStockBelowMinimum(quantityOnHand, reorderLevel) && quantityOnHand <= 0,
      } satisfies StockItem & WarehouseStockRow & { total_value: number; bin_location: string; is_low_stock: boolean; is_critical: boolean };
    });

    const summary = {
      totalItems: stockRows.length,
      totalQuantity: stockRows.reduce((sum, item) => sum + Number(item.quantity_on_hand || 0), 0),
      totalValue: stockRows.reduce((sum, item) => sum + Number(item.quantity_on_hand || 0) * Number(item.unit_cost || 0), 0),
    };

    return NextResponse.json({
      stock: stockRows,
      bins,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo obtener el stock de bodega';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.user.id !== context.userId || access.organizationId !== context.organizationId) {
    return NextResponse.json({ error: 'No se pudo verificar tu acceso a esta Bodega.' }, { status: 403 });
  }

  // Manual stock creation previously assigned an arbitrary first bin and
  // bypassed physical counting and Laudus reconciliation. Require a controlled
  // import/approval flow instead of silently creating an unverified balance.
  return NextResponse.json({
    error: 'Las altas de existencias requieren revisión de Bodega. Utiliza la importación y conciliación autorizadas.',
  }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
}
