import type { SupabaseClient } from '@supabase/supabase-js';

type JsonRow = Record<string, any>;

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function futureIssuedDateIncidents(
  rows: JsonRow[],
  entity: 'purchase_order' | 'waybill',
  now = new Date(),
) {
  const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const extremeThreshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const idField = entity === 'purchase_order' ? 'purchaseOrderId' : 'purchaseWaybillId';

  const incidents = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const issued = parseDate(row.issuedDate);
    if (!issued || issued <= threshold) continue;

    const externalId = String(row[idField] ?? row.id ?? '').trim();
    if (!externalId) continue;

    const fingerprint = `future_issued_date:${entity}:${externalId}`;
    incidents.set(fingerprint, {
      fingerprint,
      severity: issued > extremeThreshold ? 'error' : 'warning',
      message: entity === 'purchase_order'
        ? 'Laudus reporta una orden de compra con fecha de emisión futura.'
        : 'Laudus reporta una guía de compra con fecha de emisión futura.',
      details: {
        entity,
        external_id: externalId,
        issued_date: issued.toISOString(),
      },
    });
  }

  return [...incidents.values()];
}

export async function reconcileFutureIssuedDateIncidents(
  db: SupabaseClient,
  organizationId: string,
  domain: 'procurement' | 'waybills',
  incidents: Record<string, unknown>[],
) {
  const { data, error } = await db.rpc('motil_reconcile_laudus_data_quality_incidents', {
    p_organization_id: organizationId,
    p_domain: domain,
    p_rule: 'future_issued_date',
    p_incidents: incidents,
  });
  if (error) throw new Error('Laudus future-date quality reconciliation failed');
  return (data || {}) as Record<string, unknown>;
}
