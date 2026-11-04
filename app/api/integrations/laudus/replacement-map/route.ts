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
    const results = await Promise.allSettled([
      context.supabase.from('laudus_inventory_reconciliation_summary_service_v1').select('*').eq('organization_id', context.organizationId).maybeSingle(),
      context.supabase.from('laudus_supplier_bridge_summary_service_v1').select('*').eq('organization_id', context.organizationId).maybeSingle(),
      context.supabase.from('purchase_order_reconciliation_preview_service_v1').select('purchase_order_id,cost_center_resolution_status,supplier_resolution_status').eq('organization_id', context.organizationId),
      context.supabase.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id,payment_status').eq('organization_id', context.organizationId),
      context.supabase.from('laudus_accounts_payable_service_v1').select('id,due_date,outstanding_amount,status').eq('organization_id', context.organizationId),
      context.supabase.from('laudus_fixed_assets_service_v1').select('id,reconciliation_status').eq('organization_id', context.organizationId),
      context.supabase.from('finance_bank_statement_summary_v1').select('statement_import_id').eq('organization_id', context.organizationId),
      context.supabase.from('procurement_sii_dte_imports').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
      context.supabase.from('laudus_accounting_entries_service_v1').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
      context.supabase.from('laudus_accounting_management_summary_v1').select('*').eq('organization_id', context.organizationId).maybeSingle(),
      context.supabase.rpc('motil_laudus_invoice_trace_coverage', { p_organization_id: context.organizationId }),
      context.supabase.from('laudus_waybills_service_v1').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
      context.supabase.from('canonical_goods_receipts_v1').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    ]);

    const value = <T,>(index: number): T | null => {
      const result = results[index];
      if (result.status !== 'fulfilled') return null;
      const payload = result.value as any;
      if (payload?.error) return null;
      return payload as T;
    };

    const inventory = value<any>(0);
    const supplierSummary = value<any>(1);
    const poReview = value<any>(2);
    const invoices = value<any>(3);
    const payables = value<any>(4);
    const assets = value<any>(5);
    const bankStatements = value<any>(6);
    const dtes = value<any>(7);
    const accountingEntries = value<any>(8);
    const accountingSummary = value<any>(9);
    const invoiceTraceCoverage = value<any>(10);
    const waybills = value<any>(11);
    const canonicalReceipts = value<any>(12);

    const poRows = poReview?.data || [];
    const invoiceRows = invoices?.data || [];
    const payableRows = payables?.data || [];
    const assetRows = assets?.data || [];
    const today = new Date().toISOString().slice(0,10);
    const accountingTotal = accountingEntries?.count || 0;
    const accountingWithLines = Number(accountingSummary?.data?.entries_with_lines || 0);
    const traceCoverage = invoiceTraceCoverage?.data || {};
    const invoiceTraceRemaining = Math.max(
      Number(traceCoverage?.invoices_total || invoiceRows.length || 0)
      - Number(traceCoverage?.invoices_scanned || 0),
      0,
    );

    const domains = [
      {
        key: 'inventory',
        label: 'Inventario',
        state: 'operational',
        detail: 'Stock Laudus ya alimenta la vista operacional MOTIL; diferencias históricas quedan separadas de conflictos reales.',
        blockers: Number((inventory?.data as any)?.negative_positions || 0),
        actionHref: '/dashboard/bodega',
      },
      {
        key: 'suppliers',
        label: 'Proveedores',
        state: ((supplierSummary?.data as any)?.unresolved || 0) === 0 ? 'operational' : 'review',
        detail: 'Identidad canónica reutiliza RUT verificado y evita revisar miles de OC históricas.',
        blockers: Number((supplierSummary?.data as any)?.unresolved || 0) + Number((supplierSummary?.data as any)?.ambiguous || 0),
        actionHref: '/dashboard/compras',
      },
      {
        key: 'purchase_orders',
        label: 'Órdenes de compra',
        state: poRows.filter((row:any)=>['conflict','unresolved'].includes(String(row.supplier_resolution_status))).length === 0 ? 'operational' : 'review',
        detail: 'OC históricas se reconcilian sin reescribir fuente. Centros multi-línea válidos no se consideran conflicto.',
        blockers: poRows.filter((row:any)=>['conflict','unresolved','unknown_code','multi_line_review'].includes(String(row.supplier_resolution_status)) || ['unknown_code','multi_line_review','unresolved'].includes(String(row.cost_center_resolution_status))).length,
        actionHref: '/dashboard/compras',
      },
      {
        key: 'receipts',
        label: 'Recepciones / Guías',
        state: (waybills?.count || 0) > 0 && (canonicalReceipts?.count || 0) >= (waybills?.count || 0) ? 'operational' : 'transition',
        detail: 'Laudus aporta guías como evidencia documental; MOTIL sólo promueve recepción física cuando existe aceptación operacional verificable.',
        blockers: Math.max(Number(waybills?.count || 0) - Number(canonicalReceipts?.count || 0), 0),
        actionHref: '/dashboard/compras',
      },
      {
        key: 'invoices',
        label: 'Facturas',
        state: invoiceTraceRemaining === 0 ? 'operational' : 'transition',
        detail: 'Facturas Laudus están disponibles como evidencia; falta persistir trazabilidad recepción↔factura antes de retirar Laudus de este control.',
        blockers: invoiceTraceRemaining,
        actionHref: '/dashboard/compras/facturas',
      },
      {
        key: 'payables',
        label: 'Cuentas por pagar',
        state: 'transition',
        detail: 'Exposición Laudus visible en Tesorería, sin promover deuda automáticamente.',
        blockers: payableRows.filter((row:any)=>Number(row.outstanding_amount || 0)>0 && row.due_date && row.due_date < today).length,
        actionHref: '/dashboard/finanzas/pagos',
      },
      {
        key: 'assets',
        label: 'Activos',
        state: assetRows.some((row:any)=>row.reconciliation_status === 'pending') ? 'review' : 'operational',
        detail: 'La conciliación usa decisiones humanas confirmables/rechazables/diferibles.',
        blockers: assetRows.filter((row:any)=>row.reconciliation_status === 'pending').length,
        actionHref: '/dashboard/finanzas/activos',
      },
      {
        key: 'banks',
        label: 'Bancos',
        state: (bankStatements?.data || []).length > 0 ? 'transition' : 'blocked',
        detail: 'MOTIL ya tiene una fuente bancaria propia e idempotente; falta poblarla con extractos reales.',
        blockers: (bankStatements?.data || []).length > 0 ? 0 : 1,
        actionHref: '/dashboard/finanzas/pagos',
      },
      {
        key: 'dte',
        label: 'DTE / SII',
        state: (dtes?.count || 0) > 0 ? 'transition' : 'blocked',
        detail: 'La autoridad objetivo es SII directo; Laudus quedará sólo como referencia histórica.',
        blockers: (dtes?.count || 0) > 0 ? 0 : 1,
        actionHref: '/dashboard/administracion/sii/preparacion',
      },
      {
        key: 'accounting',
        label: 'Contabilidad',
        state: accountingTotal > 0 && accountingWithLines === accountingTotal ? 'operational' : 'transition',
        detail: 'Se preservan líneas y dimensiones; el backfill debe completar cobertura antes de usarla como gestión.',
        blockers: Math.max(accountingTotal - accountingWithLines,0),
        actionHref: '/dashboard/finanzas',
      },
      {
        key: 'sales',
        label: 'Clientes / Ventas',
        state: 'discovery',
        detail: 'Aún no existe dominio canónico MOTIL. Primero debemos confirmar si La Patagua usa clientes/pedidos/ventas en Laudus.',
        blockers: 1,
        actionHref: '/dashboard/calidad-datos/reemplazo-laudus',
      },
    ];

    return NextResponse.json({
      domains,
      summary: {
        total: domains.length,
        operational: domains.filter((row)=>row.state==='operational').length,
        transition: domains.filter((row)=>row.state==='transition').length,
        review: domains.filter((row)=>row.state==='review').length,
        blocked: domains.filter((row)=>row.state==='blocked').length,
        discovery: domains.filter((row)=>row.state==='discovery').length,
      },
      policy: {
        laudusWritesAllowed: false,
        automaticCanonicalPromotion: false,
        replacementGoal: 'zero_daily_operational_dependency',
      },
    });
  } catch (error) {
    console.error('[laudus/replacement-map]', error);
    return NextResponse.json({ error: 'No fue posible calcular el mapa de reemplazo Laudus.' }, { status: 500 });
  }
}
