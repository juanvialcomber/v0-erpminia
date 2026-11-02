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
    ]);

    const error = invoiceCount.error || waybillCount.error || invoices.error || waybills.error;
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
