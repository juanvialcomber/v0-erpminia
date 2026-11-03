export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const MAX_ROWS = 1000;

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.CORE_CENTROS_COSTOS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const integration = context.supabase.schema('integration');

  try {
    const [entriesResult, centersResult, totalEntries, entriesWithCenter, health] = await Promise.all([
      integration
        .from('laudus_accounting_entries')
        .select('external_id,entry_number,entry_date,journal_code,entry_type,description,cost_center_external_id,debit_total,credit_total,currency_code,synced_at')
        .eq('organization_id', context.organizationId)
        .order('entry_date', { ascending: false, nullsFirst: false })
        .limit(MAX_ROWS),
      integration
        .from('laudus_cost_centers')
        .select('external_id,code,name,reconciliation_status')
        .eq('organization_id', context.organizationId),
      integration
        .from('laudus_accounting_entries')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId),
      integration
        .from('laudus_accounting_entries')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .not('cost_center_external_id', 'is', null),
      context.supabase
        .from('laudus_sync_health_service_v1')
        .select('health_status,last_success_at,last_error')
        .eq('organization_id', context.organizationId)
        .eq('domain', 'accounting_entries')
        .maybeSingle(),
    ]);

    if (entriesResult.error) throw entriesResult.error;
    if (centersResult.error) throw centersResult.error;
    if (totalEntries.error) throw totalEntries.error;
    if (entriesWithCenter.error) throw entriesWithCenter.error;
    if (health.error) throw health.error;

    const centers = new Map((centersResult.data || []).map((row: any) => [
      String(row.external_id || ''),
      {
        code: row.code ? String(row.code) : null,
        name: row.name ? String(row.name) : null,
        reconciliationStatus: row.reconciliation_status ? String(row.reconciliation_status) : null,
      },
    ]));

    const grouped = new Map<string, { centerId: string; code: string | null; name: string | null; entries: number; debit: number; credit: number; latestDate: string | null; reconciliationStatus: string | null }>();

    for (const row of entriesResult.data || []) {
      const centerId = String(row.cost_center_external_id || '');
      if (!centerId) continue;
      const center = centers.get(centerId);
      const current = grouped.get(centerId) || {
        centerId,
        code: center?.code || null,
        name: center?.name || null,
        entries: 0,
        debit: 0,
        credit: 0,
        latestDate: null,
        reconciliationStatus: center?.reconciliationStatus || null,
      };
      current.entries += 1;
      current.debit += n(row.debit_total);
      current.credit += n(row.credit_total);
      if (!current.latestDate && row.entry_date) current.latestDate = String(row.entry_date);
      grouped.set(centerId, current);
    }

    const byCenter = [...grouped.values()]
      .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit))
      .slice(0, 50);

    const recentEntries = (entriesResult.data || []).slice(0, 100).map((row: any) => {
      const center = centers.get(String(row.cost_center_external_id || ''));
      return {
        externalId: String(row.external_id || ''),
        entryNumber: row.entry_number ? String(row.entry_number) : null,
        entryDate: row.entry_date ? String(row.entry_date) : null,
        journalCode: row.journal_code ? String(row.journal_code) : null,
        entryType: row.entry_type ? String(row.entry_type) : null,
        description: row.description ? String(row.description) : null,
        costCenterExternalId: row.cost_center_external_id ? String(row.cost_center_external_id) : null,
        costCenterCode: center?.code || null,
        costCenterName: center?.name || null,
        debitTotal: n(row.debit_total),
        creditTotal: n(row.credit_total),
        currency: row.currency_code ? String(row.currency_code) : 'CLP',
      };
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      summary: {
        totalEntries: totalEntries.count ?? 0,
        entriesWithCostCenter: entriesWithCenter.count ?? 0,
        costCenterCoveragePct: totalEntries.count ? Math.round(((entriesWithCenter.count ?? 0) / totalEntries.count) * 1000) / 10 : 0,
      },
      freshness: {
        healthStatus: health.data?.health_status || 'unknown',
        lastSuccessAt: health.data?.last_success_at || null,
        lastError: health.data?.last_error || null,
      },
      sample: {
        entriesRead: (entriesResult.data || []).length,
        maxRows: MAX_ROWS,
      },
      byCenter,
      recentEntries,
      policy: {
        source: 'Laudus',
        noAccountingMutation: true,
        notCurrentBalance: true,
      },
    }, { headers: { 'Cache-Control': 'private, max-age=120' } });
  } catch (error) {
    console.error('[laudus/accounting-cost-centers]', error);
    return NextResponse.json({ error: 'No se pudo cargar el movimiento contable Laudus por centro de costo.' }, { status: 500 });
  }
}
