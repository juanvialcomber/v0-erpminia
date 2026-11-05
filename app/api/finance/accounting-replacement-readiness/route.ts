export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [entriesResult, summaryResult] = await Promise.all([
      context.supabase
        .from('laudus_accounting_entries_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId),
      context.supabase
        .from('laudus_accounting_management_summary_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
    ]);

    if (entriesResult.error) throw entriesResult.error;
    if (summaryResult.error) throw summaryResult.error;

    const totalEntries = entriesResult.count || 0;
    const summary = summaryResult.data;
    const entriesWithLines = Number(summary?.entries_with_lines || 0);
    const coveragePct = totalEntries > 0
      ? Math.round((entriesWithLines / totalEntries) * 1000) / 10
      : 0;

    return NextResponse.json({
      authorityTarget: 'MOTIL_MANAGEMENT_LEDGER',
      laudusRoleTarget: 'financial_source_reference',
      status: totalEntries > 0 && entriesWithLines === totalEntries ? 'ready' : 'backfill_required',
      source: {
        totalEntries,
        entriesWithLines,
        lineRows: Number(summary?.line_rows || 0),
        coveragePct,
        withAccount: Number(summary?.with_account || 0),
        withCurrency: Number(summary?.with_currency || 0),
        withCostCenter: Number(summary?.with_cost_center || 0),
        withDescription: Number(summary?.with_description || 0),
        withDocument: Number(summary?.with_document || 0),
        firstEntryDate: summary?.first_entry_date || null,
        lastEntryDate: summary?.last_entry_date || null,
      },
      policy: {
        autoPostToMotilLedger: false,
        autoRewriteOperationalHistory: false,
        accountingSourceIsNotOperationalTruth: true,
        humanReviewRequiredForPromotion: true,
      },
    });
  } catch (error) {
    console.error('[finance/accounting-replacement-readiness]', error);
    return NextResponse.json({ error: 'No fue posible calcular el reemplazo contable.' }, { status: 500 });
  }
}
