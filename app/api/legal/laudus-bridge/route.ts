export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

type InvoiceStatusRow = {
  supplier_external_id: string | null;
  supplier_name: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  outstanding_amount: number | string | null;
  payment_count: number | string | null;
  last_payment_at: string | null;
  payment_status: string | null;
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const { data: contracts, error: contractError } = await context.supabase
    .from('contracts')
    .select('id,contract_number,title,contractor_name,contract_value,paid_amount,currency,status,supplier_id,updated_at')
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })
    .limit(250);

  if (contractError) {
    return NextResponse.json({ error: 'No se pudieron consultar contratos' }, { status: 503 });
  }

  const supplierIds = [...new Set((contracts || []).map((item) => item.supplier_id).filter(Boolean))] as string[];
  const { data: suppliers, error: supplierError } = supplierIds.length
    ? await context.supabase
        .from('suppliers')
        .select('id,name,rut')
        .eq('organization_id', context.organizationId)
        .in('id', supplierIds)
        .limit(250)
    : { data: [], error: null };

  if (supplierError) {
    return NextResponse.json({ error: 'No se pudieron consultar proveedores contractuales' }, { status: 503 });
  }

  const supplierById = new Map((suppliers || []).map((item) => [item.id, item]));
  const taxIds = [...new Set((suppliers || []).map((item) => item.rut).filter(Boolean))] as string[];

  const { data: laudusSuppliers, error: laudusSupplierError } = taxIds.length
    ? await context.supabase
        .from('laudus_suppliers_service_v1')
        .select('external_id,tax_id,name,legal_name,reconciliation_status,synced_at')
        .eq('organization_id', context.organizationId)
        .in('tax_id', taxIds)
        .limit(250)
    : { data: [], error: null };

  if (laudusSupplierError) {
    return NextResponse.json({ error: 'No se pudo consultar la conciliación de proveedores Laudus' }, { status: 503 });
  }

  const laudusByTaxId = new Map((laudusSuppliers || []).map((item) => [item.tax_id, item]));
  const laudusExternalIds = [...new Set((laudusSuppliers || []).map((item) => item.external_id).filter(Boolean))] as string[];

  const { data: invoiceStatuses, error: invoiceError } = laudusExternalIds.length
    ? await context.supabase
        .from('laudus_purchase_invoice_payment_status_service_v1')
        .select('supplier_external_id,supplier_name,total_amount,paid_amount,outstanding_amount,payment_count,last_payment_at,payment_status')
        .eq('organization_id', context.organizationId)
        .in('supplier_external_id', laudusExternalIds)
        .limit(5000)
    : { data: [], error: null };

  if (invoiceError) {
    return NextResponse.json({ error: 'No se pudo consultar facturación y pagos Laudus' }, { status: 503 });
  }

  const financeBySupplier = new Map<string, {
    invoice_count: number;
    invoiced_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    payment_count: number;
    last_payment_at: string | null;
    payment_statuses: Set<string>;
  }>();

  for (const row of (invoiceStatuses || []) as InvoiceStatusRow[]) {
    const key = String(row.supplier_external_id || '');
    if (!key) continue;
    const current = financeBySupplier.get(key) || {
      invoice_count: 0,
      invoiced_amount: 0,
      paid_amount: 0,
      outstanding_amount: 0,
      payment_count: 0,
      last_payment_at: null,
      payment_statuses: new Set<string>(),
    };
    current.invoice_count += 1;
    current.invoiced_amount += number(row.total_amount);
    current.paid_amount += number(row.paid_amount);
    current.outstanding_amount += number(row.outstanding_amount);
    current.payment_count += number(row.payment_count);
    if (row.last_payment_at && (!current.last_payment_at || row.last_payment_at > current.last_payment_at)) {
      current.last_payment_at = row.last_payment_at;
    }
    if (row.payment_status) current.payment_statuses.add(row.payment_status);
    financeBySupplier.set(key, current);
  }

  const [settlementCountResult, latestSettlementResult] = await Promise.all([
    context.supabase
      .from('transport_settlements')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
    context.supabase
      .from('transport_settlements')
      .select('updated_at,period_end')
      .eq('organization_id', context.organizationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const items = (contracts || []).map((contract) => {
    const supplier = contract.supplier_id ? supplierById.get(contract.supplier_id) : null;
    const laudusSupplier = supplier?.rut ? laudusByTaxId.get(supplier.rut) : null;
    const finance = laudusSupplier?.external_id ? financeBySupplier.get(laudusSupplier.external_id) : null;

    return {
      id: contract.id,
      contract_number: contract.contract_number,
      title: contract.title,
      contractor_name: contract.contractor_name,
      contract_value: number(contract.contract_value),
      contract_paid_amount: number(contract.paid_amount),
      currency: contract.currency || 'CLP',
      status: contract.status,
      supplier: supplier
        ? { id: supplier.id, name: supplier.name, rut: supplier.rut }
        : null,
      laudus: laudusSupplier
        ? {
            external_id: laudusSupplier.external_id,
            name: laudusSupplier.legal_name || laudusSupplier.name,
            reconciliation_status: laudusSupplier.reconciliation_status,
            synced_at: laudusSupplier.synced_at,
            invoice_count: finance?.invoice_count || 0,
            invoiced_amount: finance?.invoiced_amount || 0,
            paid_amount: finance?.paid_amount || 0,
            outstanding_amount: finance?.outstanding_amount || 0,
            payment_count: finance?.payment_count || 0,
            last_payment_at: finance?.last_payment_at || null,
            payment_statuses: finance ? [...finance.payment_statuses] : [],
          }
        : null,
      attribution: laudusSupplier
        ? {
            level: 'supplier',
            exact_contract_payment: false,
            reason: 'La evidencia Laudus está conciliada al proveedor. Falta vincular OC/factura al contrato para atribución exacta.',
          }
        : {
            level: 'unresolved',
            exact_contract_payment: false,
            reason: supplier ? 'Proveedor MOTIL sin match Laudus verificable.' : 'Contrato sin proveedor MOTIL enlazado.',
          },
    };
  });

  const matched = items.filter((item) => Boolean(item.laudus));
  const totalPaidSupplierLevel = matched.reduce((sum, item) => sum + number(item.laudus?.paid_amount), 0);
  const totalOutstandingSupplierLevel = matched.reduce((sum, item) => sum + number(item.laudus?.outstanding_amount), 0);

  return NextResponse.json({
    data: items,
    summary: {
      contracts: items.length,
      contracts_with_supplier: items.filter((item) => Boolean(item.supplier)).length,
      contracts_with_laudus_supplier: matched.length,
      contracts_without_laudus_supplier: items.filter((item) => !item.laudus).length,
      supplier_level_paid_amount: totalPaidSupplierLevel,
      supplier_level_outstanding_amount: totalOutstandingSupplierLevel,
      transport_settlements: settlementCountResult.count || 0,
      transport_latest_period_end: latestSettlementResult.data?.period_end || null,
      transport_latest_updated_at: latestSettlementResult.data?.updated_at || null,
    },
    migration: {
      can_move_now: [
        'Consulta de proveedor y datos maestros',
        'Consulta de facturas y estado de pago por proveedor',
        'Consulta de última evidencia de pago disponible en Laudus',
        'Historial de liquidaciones de transportistas ya cargado en MOTIL',
      ],
      needs_binding: [
        'Atribución exacta de facturas/pagos a cada contrato mediante OC y/o factura',
        'Confirmación de transferencia como hito contractual cuando la evidencia financiera esté vinculada al contrato',
      ],
      stays_laudus_canonical: [
        'Contabilidad y libros',
        'DTE tributario',
        'Pago bancario/contable ejecutado',
      ],
    },
    policy: {
      source: 'Laudus se usa como fuente financiera de solo lectura. Legal opera y decide en MOTIL.',
      warning: 'Los montos Laudus mostrados son a nivel proveedor y no reemplazan el pagado contractual hasta vincular OC/factura.',
    },
  });
}
