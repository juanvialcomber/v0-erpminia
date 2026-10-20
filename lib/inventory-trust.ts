import 'server-only';

type InventoryConflictEvidence = {
  conflictCodes: Set<string>;
};

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getInventoryConflictEvidence(
  supabase: any,
  organizationId: string,
): Promise<InventoryConflictEvidence> {
  const code = 'Combustible001';

  const [positionResult, referenceResult] = await Promise.all([
    supabase
      .from('inventory_intelligence_position_v1')
      .select('product_code,quantity_available,unit_cost')
      .eq('organization_id', organizationId)
      .eq('product_code', code)
      .order('last_counted_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('canonical_products_v1')
      .select('product_code,standard_cost,source_payload')
      .eq('organization_id', organizationId)
      .eq('product_code', code)
      .maybeSingle(),
  ]);

  if (positionResult.error) throw positionResult.error;
  if (referenceResult.error) throw referenceResult.error;

  const current = positionResult.data || null;
  const reference = referenceResult.data || null;
  if (!current || !reference) return { conflictCodes: new Set<string>() };

  const referenceQuantity =
    finiteNumber(reference.source_payload?.quantity_available) ??
    finiteNumber(reference.source_payload?.quantity_on_hand);
  const currentQuantity = finiteNumber(current.quantity_available);
  const referenceUnitCost =
    finiteNumber(reference.source_payload?.unit_cost) ??
    finiteNumber(reference.standard_cost);
  const currentUnitCost = finiteNumber(current.unit_cost);

  const hasConflict =
    (referenceQuantity != null && currentQuantity != null && referenceQuantity !== currentQuantity) ||
    (referenceUnitCost != null && currentUnitCost != null && referenceUnitCost !== currentUnitCost);

  return {
    conflictCodes: hasConflict ? new Set([code.toUpperCase()]) : new Set<string>(),
  };
}
