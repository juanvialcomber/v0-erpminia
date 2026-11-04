export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const supplierId = request.nextUrl.searchParams.get('supplierId');
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';

  try {
    if (!supplierId) {
      let query = context.supabase
        .from('canonical_suppliers_v1')
        .select('id, tax_id, legal_name, trade_name, business_activity, payment_terms, email, phone, region, is_active, validation_status')
        .eq('organization_id', context.organizationId)
        .order('legal_name')
        .limit(80);
      if (q) query = query.or(`tax_id.ilike.%${q}%,legal_name.ilike.%${q}%,trade_name.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ suppliers: data || [] });
    }

    const { data: supplier, error: supplierError } = await context.supabase
      .from('canonical_suppliers_v1')
      .select('id,tax_id,legal_name,trade_name,business_activity,payment_terms,address,commune,region,country,phone,email,is_active,validation_status')
      .eq('organization_id', context.organizationId)
      .eq('id', supplierId)
      .single();
    if (supplierError) throw supplierError;

    const orderFilter = `canonical_supplier_id.eq.${supplierId}${supplier.tax_id ? `,supplier_tax_id.eq.${supplier.tax_id}` : ''}`;

    const [{ data: laudusSupplier, error: laudusSupplierError }, { data: laudusHealth, error: laudusHealthError }] = await Promise.all([
      context.supabase
        .from('laudus_suppliers_service_v1')
        .select('external_id,reconciliation_status,synced_at')
        .eq('organization_id', context.organizationId)
        .eq('canonical_supplier_id', supplierId)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from('laudus_sync_health_service_v1')
        .select('domain,health_status,last_success_at,consecutive_failures,open_incidents')
        .eq('organization_id', context.organizationId)
        .in('domain', ['suppliers','procurement']),
    ]);
    if (laudusSupplierError) throw laudusSupplierError;
    if (laudusHealthError) throw laudusHealthError;

    let laudusFinancial: Record<string, unknown> = {
      linked: false,
      coverage: { totalRows: 0, returnedRows: 0, complete: true },
      summaryByCurrency: [],
      invoices: [],
      supplierSyncAt: null,
      sourceHealth: laudusHealth || [],
      readOnly: true,
      canonicalMutated: false,
    };

    if (laudusSupplier?.external_id) {
      const { data: laudusInvoices, error: laudusInvoicesError, count: laudusInvoiceCount } = await context.supabase
        .from('laudus_purchase_invoice_payment_status_service_v1')
        .select('purchase_invoice_external_id,doc_number,issued_date,due_date,total_amount,currency,paid_amount,outstanding_amount,payment_count,last_payment_at,payment_status', { count: 'exact' })
        .eq('organization_id', context.organizationId)
        .eq('supplier_external_id', laudusSupplier.external_id)
        .order('issued_date', { ascending: false })
        .limit(1000);
      if (laudusInvoicesError) throw laudusInvoicesError;

      const rows = laudusInvoices || [];
      const totalRows = Number(laudusInvoiceCount ?? rows.length);
      const complete = totalRows <= rows.length;
      const byCurrency = new Map<string, {
        currency: string;
        invoiceCount: number;
        totalAmount: number;
        paidAmount: number;
        outstandingAmount: number;
        overdueAmount: number;
        overdueInvoices: number;
        latestInvoiceAt: string | null;
        latestPaymentAt: string | null;
      }>();

      for (const row of rows) {
        const currency = String(row.currency || '').trim();
        if (!currency) continue;
        const current = byCurrency.get(currency) || {
          currency,
          invoiceCount: 0,
          totalAmount: 0,
          paidAmount: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
          overdueInvoices: 0,
          latestInvoiceAt: null,
          latestPaymentAt: null,
        };
        current.invoiceCount += 1;
        current.totalAmount += Number(row.total_amount || 0);
        current.paidAmount += Number(row.paid_amount || 0);
        current.outstandingAmount += Number(row.outstanding_amount || 0);
        const dueAt = row.due_date ? Date.parse(row.due_date) : Number.NaN;
        const outstanding = Number(row.outstanding_amount || 0);
        if (Number.isFinite(dueAt) && dueAt < Date.now() && outstanding > 0) {
          current.overdueAmount += outstanding;
          current.overdueInvoices += 1;
        }
        if (row.issued_date && (!current.latestInvoiceAt || Date.parse(row.issued_date) > Date.parse(current.latestInvoiceAt))) current.latestInvoiceAt = row.issued_date;
        if (row.last_payment_at && (!current.latestPaymentAt || Date.parse(row.last_payment_at) > Date.parse(current.latestPaymentAt))) current.latestPaymentAt = row.last_payment_at;
        byCurrency.set(currency, current);
      }

      laudusFinancial = {
        linked: true,
        reconciliationStatus: laudusSupplier.reconciliation_status || null,
        supplierSyncAt: laudusSupplier.synced_at || null,
        sourceHealth: laudusHealth || [],
        coverage: { totalRows, returnedRows: rows.length, complete },
        summaryByCurrency: complete ? Array.from(byCurrency.values()).sort((a,b) => a.currency.localeCompare(b.currency)) : [],
        invoices: rows.slice(0, 20),
        readOnly: true,
        canonicalMutated: false,
      };
    }

    const [ordersResult, quotationsResult, operationalOrdersResult, returnsResult, invoicesResult, performanceResult, legacyPerformanceResult, contractorResult, pipelineResult] = await Promise.all([
      context.supabase.from('canonical_purchase_orders_v1').select('id, order_number, order_date, total_amount, currency, status, operational_status, expected_delivery_date, supplier_tax_id').eq('organization_id', context.organizationId).or(orderFilter).order('order_date', { ascending: false }).limit(100),
      context.supabase.from('canonical_supplier_quotations_v1').select('id, quotation_number, quotation_date, valid_until, total_amount, currency, lead_time_days, payment_terms, status').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('quotation_date', { ascending: false }).limit(100),
      context.supabase.from('procurement_operational_orders').select('id, order_number, intake_request_id, status, currency, total_amount, expected_delivery_date, actual_delivery_date, issued_at, work_order_id, canonical_asset_id, cost_center_id').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('issued_at', { ascending: false }).limit(100),
      context.supabase.from('procurement_supplier_returns').select('id, return_number, reason, resolution_type, status, requested_at, resolved_at').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('requested_at', { ascending: false }).limit(100),
      context.supabase.from('procurement_supplier_invoices').select('id, order_id, invoice_number, invoice_date, total_amount, currency, status, approval_basis, procurement_match_exceptions(id,status,exception_type,difference)').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('invoice_date', { ascending: false }).limit(100),
      context.supabase.from('supplier_operational_score_v2').select('*').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).maybeSingle(),
      context.supabase.from('supplier_performance_v1').select('*').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).maybeSingle(),
      context.supabase.from('contractors').select('id, name, rut, business_type, contact_email, contact_phone, address, city, region, registration_status').eq('rut', supplier.tax_id).maybeSingle(),
      context.supabase.from('operational_procurement_pipeline').select('intake_request_id,request_number,order_id,work_order_id,canonical_asset_id,supplier_id').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).limit(300),
    ]);

    const firstError = [ordersResult, quotationsResult, operationalOrdersResult, returnsResult, invoicesResult, performanceResult, legacyPerformanceResult, contractorResult, pipelineResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const orderIds = (ordersResult.data || []).map((order) => order.id);
    const validPipelineRows = (pipelineResult.data || []).filter((row) => !/^UAT-/i.test(String(row.request_number || '').trim()));
    const validOperationalOrderIds = new Set(validPipelineRows.map((row) => row.order_id).filter(Boolean));
    const operationalOrders = (operationalOrdersResult.data || []).filter((row) => validOperationalOrderIds.has(row.id));
    const operationalInvoices = (invoicesResult.data || []).filter((row) => validOperationalOrderIds.has(row.order_id));
    const linkedWorkOrderIds = [...new Set(validPipelineRows.map((row) => row.work_order_id).filter(Boolean))];
    const linkedAssetIds = [...new Set(validPipelineRows.map((row) => row.canonical_asset_id).filter(Boolean))];
    const operationalInvoiceIds = operationalInvoices.map((row) => row.id);

    const { data: motilPayables, error: motilPayablesError } = operationalInvoiceIds.length
      ? await context.supabase
          .from('procurement_accounts_payable_v1')
          .select('id,invoice_id,invoice_number,invoice_date,supplier_id,supplier_name,currency,approved_amount,due_date,status,paid_amount,outstanding_amount,days_to_due')
          .eq('organization_id', context.organizationId)
          .in('invoice_id', operationalInvoiceIds)
          .order('due_date', { ascending: true, nullsFirst: true })
          .limit(200)
      : { data: [], error: null };
    if (motilPayablesError) throw motilPayablesError;

    const payableIds = (motilPayables || []).map((row) => row.id);
    const { data: motilPayments, error: motilPaymentsError } = payableIds.length
      ? await context.supabase
          .from('procurement_supplier_payments')
          .select('id,payable_id,amount,currency,payment_date,payment_reference,reconciled_at,reconciliation_reference')
          .eq('organization_id', context.organizationId)
          .in('payable_id', payableIds)
          .order('payment_date', { ascending: false })
          .limit(200)
      : { data: [], error: null };
    if (motilPaymentsError) throw motilPaymentsError;

    const motilFinanceByCurrency = new Map<string, {
      currency: string;
      approvedAmount: number;
      paidAmount: number;
      outstandingAmount: number;
      overdueAmount: number;
      payableCount: number;
      overdueCount: number;
    }>();
    for (const row of motilPayables || []) {
      const currency = String(row.currency || '').trim() || 'CLP';
      const current = motilFinanceByCurrency.get(currency) || {
        currency,
        approvedAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        overdueAmount: 0,
        payableCount: 0,
        overdueCount: 0,
      };
      const outstanding = Number(row.outstanding_amount || 0);
      current.approvedAmount += Number(row.approved_amount || 0);
      current.paidAmount += Number(row.paid_amount || 0);
      current.outstandingAmount += outstanding;
      current.payableCount += 1;
      if (Number(row.days_to_due) < 0 && outstanding > 0) {
        current.overdueAmount += outstanding;
        current.overdueCount += 1;
      }
      motilFinanceByCurrency.set(currency, current);
    }

    const motilFinancial = {
      summaryByCurrency: [...motilFinanceByCurrency.values()].sort((a,b) => a.currency.localeCompare(b.currency)),
      payables: motilPayables || [],
      payments: motilPayments || [],
      unreconciledPayments: (motilPayments || []).filter((row) => !row.reconciled_at).length,
      maintenanceLinkage: {
        operationalOrders: operationalOrders.length,
        linkedWorkOrders: linkedWorkOrderIds.length,
        linkedAssets: linkedAssetIds.length,
        unlinkedOrders: operationalOrders.filter((row) => !row.work_order_id && !row.canonical_asset_id).length,
        excludedUatOrders: (operationalOrdersResult.data || []).length - operationalOrders.length,
      },
      semantics: {
        payable: 'Obligación aprobada en el flujo operacional MOTIL.',
        payment: 'Salida de caja registrada en MOTIL; la conciliación confirma evidencia bancaria/contable.',
        maintenanceLink: 'Sólo cuenta vínculos explícitos de la OC a OT o activo. MOTIL no infiere el destino por producto o proveedor.',
      },
    };

    const [linesResult, contractsResult, documentsResult] = await Promise.all([
      orderIds.length
        ? context.supabase.from('canonical_purchase_order_lines_v1').select('purchase_order_id, canonical_product_id, product_code, description, quantity, unit, unit_cost, net_amount').eq('organization_id', context.organizationId).in('purchase_order_id', orderIds).limit(3000)
        : Promise.resolve({ data: [], error: null }),
      contractorResult.data
        ? context.supabase.from('contracts').select('id, contract_number, contract_type, title, start_date, end_date, contract_value, currency, status, payment_terms, document_url, file_url').eq('organization_id', context.organizationId).eq('contractor_id', contractorResult.data.id).order('start_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      contractorResult.data
        ? context.supabase.from('procurement_documents').select('id, document_type, document_number, issue_date, due_date, amount, currency, status, document_url').eq('contractor_id', contractorResult.data.id).order('issue_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    const secondaryError = linesResult.error || contractsResult.error || documentsResult.error;
    if (secondaryError) throw secondaryError;

    const productMap = new Map<string, { canonical_product_id: string | null; product_code: string | null; description: string | null; quantity: number; spend: number; last_unit_cost: number }>();
    for (const line of linesResult.data || []) {
      const key = line.canonical_product_id || line.product_code || line.description || 'sin-codigo';
      const current = productMap.get(key) || { canonical_product_id: line.canonical_product_id, product_code: line.product_code, description: line.description, quantity: 0, spend: 0, last_unit_cost: 0 };
      current.quantity += Number(line.quantity || 0);
      current.spend += Number(line.net_amount || 0);
      current.last_unit_cost = Number(line.unit_cost || current.last_unit_cost || 0);
      productMap.set(key, current);
    }

    return NextResponse.json({
      supplier,
      contractor: contractorResult.data || null,
      performance: performanceResult.data || null,
      legacyPerformance: legacyPerformanceResult.data || null,
      orders: ordersResult.data || [],
      operationalOrders,
      motilFinancial,
      quotations: quotationsResult.data || [],
      contracts: contractsResult.data || [],
      documents: documentsResult.data || [],
      invoices: operationalInvoices,
      returns: returnsResult.data || [],
      suppliedProducts: Array.from(productMap.values()).sort((a, b) => b.spend - a.spend).slice(0, 100),
      laudusFinancial,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la ficha del proveedor.';
    console.error('[procurement/suppliers-360]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
