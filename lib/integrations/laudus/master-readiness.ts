import type { SupabaseClient } from '@supabase/supabase-js';

export type MasterEntityKey = 'products' | 'suppliers' | 'warehouses' | 'cost_centers' | 'assets';

export type MasterReadinessRow = {
  key: MasterEntityKey;
  label: string;
  total: number;
  identityReady: number;
  identityCoverage: number;
  linkedToLaudus: number;
  linkCoverage: number;
  gaps: string[];
};

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>): Promise<number> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

async function linkedCount(
  db: SupabaseClient,
  organizationId: string,
  sourceId: string | null,
  entityType: string,
) {
  if (!sourceId) return 0;
  try {
    return await count(
      db
        .schema('integration')
        .from('external_entity_links')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('source_id', sourceId)
        .eq('entity_type', entityType)
        .in('link_status', ['matched', 'confirmed']),
    );
  } catch {
    return 0;
  }
}

export async function loadLaudusMasterReadiness(
  db: SupabaseClient,
  organizationId: string,
): Promise<{ sourceId: string | null; sourceEnabled: boolean; rows: MasterReadinessRow[] }> {
  let sourceId: string | null = null;
  let sourceEnabled = false;

  try {
    const source = await db
      .schema('integration')
      .from('external_sources')
      .select('id,enabled')
      .eq('organization_id', organizationId)
      .eq('source_key', 'laudus')
      .maybeSingle();

    if (!source.error && source.data) {
      sourceId = String(source.data.id);
      sourceEnabled = Boolean(source.data.enabled);
    }
  } catch {
    // Pre-deployment state: integration schema is optional.
  }

  const [
    productsTotal,
    productsIdentity,
    productsUnit,
    suppliersTotal,
    suppliersIdentity,
    suppliersLegalName,
    warehousesTotal,
    warehousesIdentity,
    costCentersTotal,
    costCentersIdentity,
    assetsTotal,
    assetsIdentity,
    assetsCostCenter,
  ] = await Promise.all([
    count(db.schema('canonical').from('products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('product_code', 'is', null).neq('product_code', '')),
    count(db.schema('canonical').from('products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('unit', 'is', null).neq('unit', '')),
    count(db.schema('canonical').from('suppliers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('suppliers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('tax_id', 'is', null).neq('tax_id', '')),
    count(db.schema('canonical').from('suppliers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('legal_name', 'is', null).neq('legal_name', '')),
    count(db.from('warehouses').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('warehouses').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('code', 'is', null).neq('code', '')),
    count(db.schema('canonical').from('cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('cost_center_code', 'is', null).neq('cost_center_code', '')),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('asset_code', 'is', null).neq('asset_code', '')),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('cost_center_code', 'is', null).neq('cost_center_code', '')),
  ]);

  const [productLinks, supplierLinks, warehouseLinks, costCenterLinks, assetLinks] = await Promise.all([
    linkedCount(db, organizationId, sourceId, 'product'),
    linkedCount(db, organizationId, sourceId, 'supplier'),
    linkedCount(db, organizationId, sourceId, 'warehouse'),
    linkedCount(db, organizationId, sourceId, 'cost_center'),
    linkedCount(db, organizationId, sourceId, 'asset'),
  ]);

  const rows: MasterReadinessRow[] = [
    {
      key: 'products',
      label: 'Productos',
      total: productsTotal,
      identityReady: productsIdentity,
      identityCoverage: pct(productsIdentity, productsTotal),
      linkedToLaudus: productLinks,
      linkCoverage: pct(productLinks, productsTotal),
      gaps: [
        productsUnit < productsTotal ? `${productsTotal - productsUnit} producto(s) sin unidad` : '',
      ].filter(Boolean),
    },
    {
      key: 'suppliers',
      label: 'Proveedores',
      total: suppliersTotal,
      identityReady: Math.min(suppliersIdentity, suppliersLegalName),
      identityCoverage: pct(Math.min(suppliersIdentity, suppliersLegalName), suppliersTotal),
      linkedToLaudus: supplierLinks,
      linkCoverage: pct(supplierLinks, suppliersTotal),
      gaps: [],
    },
    {
      key: 'warehouses',
      label: 'Bodegas',
      total: warehousesTotal,
      identityReady: warehousesIdentity,
      identityCoverage: pct(warehousesIdentity, warehousesTotal),
      linkedToLaudus: warehouseLinks,
      linkCoverage: pct(warehouseLinks, warehousesTotal),
      gaps: [],
    },
    {
      key: 'cost_centers',
      label: 'Centros de costo',
      total: costCentersTotal,
      identityReady: costCentersIdentity,
      identityCoverage: pct(costCentersIdentity, costCentersTotal),
      linkedToLaudus: costCenterLinks,
      linkCoverage: pct(costCenterLinks, costCentersTotal),
      gaps: [],
    },
    {
      key: 'assets',
      label: 'Activos',
      total: assetsTotal,
      identityReady: assetsIdentity,
      identityCoverage: pct(assetsIdentity, assetsTotal),
      linkedToLaudus: assetLinks,
      linkCoverage: pct(assetLinks, assetsTotal),
      gaps: [
        assetsCostCenter < assetsTotal ? `${assetsTotal - assetsCostCenter} activo(s) sin centro de costo` : '',
      ].filter(Boolean),
    },
  ];

  return { sourceId, sourceEnabled, rows };
}
