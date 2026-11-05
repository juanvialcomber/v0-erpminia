export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const MAX_ROWS = 50;

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const today = new Date().toISOString().slice(0, 10);

    const [overdueCount, openCount, partialCount, rowsResult] = await Promise.all([
      context.supabase
        .from('laudus_accounts_payable_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .gt('outstanding_amount', 0)
        .lt('due_date', today),
      context.supabase
        .from('laudus_accounts_payable_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .gt('outstanding_amount', 0),
      context.supabase
        .from('laudus_accounts_payable_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .gt('outstanding_amount', 0)
        .eq('status', 'partially_paid'),
      context.supabase
        .from('laudus_accounts_payable_service_v1')
        .select('external_id,supplier_external_id,purchase_invoice_external_id,document_number,issued_date,due_date,original_amount,outstanding_amount,currency_code,status,synced_at')
        .eq('organization_id', context.organizationId)
        .gt('outstanding_amount', 0)
        .order('due_date', { ascending: true })
        .limit(MAX_ROWS),
    ]);

    const error = overdueCount.error || openCount.error || partialCount.error || rowsResult.error;
    if (error) throw error;

    const rows = rowsResult.data || [];
    const overdueRows = rows.filter((row) => row.due_date && row.due_date < today);

    const byCurrency = new Map<string, number>();
    for (const row of overdueRows) {
      const currency = String(row.currency_code || 'CLP');
      byCurrency.set(currency, (byCurrency.get(currency) || 0) + Number(row.outstanding_amount || 0));
    }

    return NextResponse.json({
      source: 'Laudus',
      readOnly: true,
      summary: {
        open: openCount.count || 0,
        overdue: overdueCount.count || 0,
        partiallyPaid: partialCount.count || 0,
        overdueByCurrency: [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount })),
      },
      rows,
      policy: {
        sourcePayableIsNotMotilOperationalPayable: true,
        sourcePaymentStatusIsNotPaymentApproval: true,
        canonicalMutationExecuted: false,
        laudusMutationExecuted: false,
      },
    });
  } catch (error) {
    console.error('[finance/laudus-payables-exposure]', error);
    return NextResponse.json({ error: 'No fue posible cargar la exposición de cuentas por pagar Laudus.' }, { status: 500 });
  }
}
