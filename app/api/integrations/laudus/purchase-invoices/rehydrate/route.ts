export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchLaudusPurchaseLedgerRange } from '@/lib/integrations/laudus/purchase-ledger';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;

  if (!access.admin) {
    return NextResponse.json(
      { error: 'La rehidratación de facturas Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const db = getSupabaseServerClient();
  const { data: bounds, error: boundsError } = await db
    .schema('integration')
    .from('laudus_purchase_invoices')
    .select('issued_date')
    .eq('organization_id', access.organizationId)
    .order('issued_date', { ascending: true })
    .limit(1);

  const { data: latest, error: latestError } = await db
    .schema('integration')
    .from('laudus_purchase_invoices')
    .select('issued_date')
    .eq('organization_id', access.organizationId)
    .order('issued_date', { ascending: false })
    .limit(1);

  if (boundsError || latestError || !bounds?.[0]?.issued_date || !latest?.[0]?.issued_date) {
    return NextResponse.json(
      { status: 'empty', calls: 0, canonicalMutated: false, laudusMutated: false },
      { status: 404 },
    );
  }

  const start = new Date(bounds[0].issued_date);
  const end = new Date(latest[0].issued_date);
  const { rows, calls } = await fetchLaudusPurchaseLedgerRange(start, end);

  const chunkSize = 500;
  let updated = 0;
  let missing = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await db.rpc('motil_rehydrate_laudus_invoice_totals', {
      p_organization_id: access.organizationId,
      p_rows: chunk,
    });
    if (error) {
      console.error('[laudus/invoices/rehydrate]', error.message);
      return NextResponse.json(
        {
          status: 'partial',
          source: 'Laudus',
          mode: 'read_only',
          calls,
          ledgerRowsRead: rows.length,
          updated,
          missing,
          canonicalMutated: false,
          laudusMutated: false,
          error: 'El libro de compras se leyó, pero el staging quedó parcialmente actualizado.',
        },
        { status: 500 },
      );
    }
    updated += Number(data?.updated ?? 0);
    missing += Number(data?.missing_staged_invoice ?? 0);
  }

  return NextResponse.json({
    status: 'ok',
    source: 'Laudus',
    mode: 'read_only',
    calls,
    ledgerRowsRead: rows.length,
    updated,
    missing,
    startMonth: start.toISOString().slice(0, 7),
    endMonth: end.toISOString().slice(0, 7),
    canonicalMutated: false,
    laudusMutated: false,
  });
}
