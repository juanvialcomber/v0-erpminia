export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const PAGE_LIMIT = 100;

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const integration = context.supabase.schema('integration');

  try {
    const [
      invoiceCount,
      waybillCount,
      invoices,
      waybills,
      procurementHealth,
      waybillHealth,
      latestInvoiceSync,
      latestWaybillSync,
    ] = await Promise.all([
      integration.from('laudus_purchase_invoices').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
      integration.from('laudus_waybills').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
      integration
        .from('laudus_purchase_invoices')
        .select('external_id,doc_number,supplier_name,supplier_tax_id,issued_date,due_date,warehouse_name,net_amount,tax_amount,total_amount,currency,quality_flags,synced_at')
        .eq('organization_id', context.organizationId)
        .order('issued_date', { ascending: false, nullsFirst: false })
        .limit(PAGE_LIMIT),
      integration
        .from('laudus_waybills')
        .select('external_id,doc_number,supplier_name,supplier_tax_id,warehouse_name,issued_date,notes,quality_flags,synced_at')
        .eq('organization_id', context.organizationId)
        .order('issued_date', { ascending: false, nullsFirst: false })
        .limit(PAGE_LIMIT),
      context.supabase
        .from('laudus_sync_health_service_v1')
        .select('health_status,last_success_at,last_error')
        .eq('organization_id', context.organizationId)
        .eq('domain', 'procurement')
        .maybeSingle(),
      context.supabase
        .from('laudus_sync_health_service_v1')
        .select('health_status,last_success_at,last_error')
        .eq('organization_id', context.organizationId)
        .eq('domain', 'waybills')
        .maybeSingle(),
      integration
        .from('laudus_purchase_invoices')
        .select('synced_at')
        .eq('organization_id', context.organizationId)
        .not('synced_at', 'is', null)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      integration
        .from('laudus_waybills')
        .select('synced_at')
        .eq('organization_id', context.organizationId)
        .not('synced_at', 'is', null)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const error = invoiceCount.error || waybillCount.error || invoices.error || waybills.error || procurementHealth.error || waybillHealth.error || latestInvoiceSync.error || latestWaybillSync.error;
    if (error) throw error;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      summary: {
        invoices: invoiceCount.count ?? 0,
        waybills: waybillCount.count ?? 0,
        visibleInvoices: (invoices.data || []).length,
        visibleWaybills: (waybills.data || []).length,
      },
      freshness: {
        invoices: {
          latestSync: latestInvoiceSync.data?.synced_at || null,
          healthStatus: procurementHealth.data?.health_status || 'unknown',
          lastSuccessAt: procurementHealth.data?.last_success_at || null,
          lastError: procurementHealth.data?.last_error || null,
        },
        waybills: {
          latestSync: latestWaybillSync.data?.synced_at || null,
          healthStatus: waybillHealth.data?.health_status || 'unknown',
          lastSuccessAt: waybillHealth.data?.last_success_at || null,
          lastError: waybillHealth.data?.last_error || null,
        },
      },
      invoices: invoices.data || [],
      waybills: waybills.data || [],
      policy: {
        laudusCanonicalForSourceDocuments: true,
        noLaudusMutation: true,
        noCanonicalPromotion: true,
      },
    }, { headers: { 'Cache-Control': 'private, max-age=120' } });
  } catch (error) {
    console.error('[laudus/purchase-documents]', error);
    return NextResponse.json({ error: 'No se pudieron cargar los documentos históricos Laudus.' }, { status: 500 });
  }
}
