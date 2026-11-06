export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { CONTRACT_PURCHASE_ORDER_CANDIDATES } from '@/lib/legal/contract-purchase-order-candidates';
import { createClient as createServiceClient } from '@/lib/supabase/server';

function normalize(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const contractNumbers = [...new Set(CONTRACT_PURCHASE_ORDER_CANDIDATES.map((item) => item.contractNumber))];
  const purchaseOrderNumbers = [...new Set(CONTRACT_PURCHASE_ORDER_CANDIDATES.map((item) => item.purchaseOrderNumber))];

  const { data: contracts, error: contractError } = await context.supabase
    .from('contracts')
    .select('id,contract_number,title,contractor_name,supplier_id')
    .eq('organization_id', context.organizationId)
    .in('contract_number', contractNumbers)
    .limit(100);

  if (contractError) {
    return NextResponse.json({ error: 'No se pudieron consultar contratos' }, { status: 503 });
  }

  const supplierIds = [...new Set((contracts || []).map((row) => row.supplier_id).filter(Boolean))] as string[];
  const { data: suppliers, error: supplierError } = supplierIds.length
    ? await context.supabase
        .from('suppliers')
        .select('id,name,rut')
        .eq('organization_id', context.organizationId)
        .in('id', supplierIds)
        .limit(100)
    : { data: [], error: null };

  if (supplierError) {
    return NextResponse.json({ error: 'No se pudieron consultar proveedores contractuales' }, { status: 503 });
  }

  const serviceDb = await createServiceClient();
  const { data: laudusOrders, error: poError } = await serviceDb
    .schema('integration')
    .from('laudus_purchase_orders')
    .select('id,external_id,laudus_purchase_order_id,order_number,supplier_tax_id,supplier_name,issued_date,total_amount,currency,status,reconciliation_status,canonical_purchase_order_id,synced_at')
    .eq('organization_id', context.organizationId)
    .in('external_id', purchaseOrderNumbers)
    .limit(500);

  if (poError) {
    return NextResponse.json({ error: 'No se pudieron consultar órdenes de compra Laudus' }, { status: 503 });
  }

  const contractByNumber = new Map((contracts || []).map((row) => [row.contract_number, row]));
  const supplierById = new Map((suppliers || []).map((row) => [row.id, row]));
  const poByNumber = new Map((laudusOrders || []).map((row) => [String(row.external_id), row]));

  const items = CONTRACT_PURCHASE_ORDER_CANDIDATES.map((candidate) => {
    const contract = contractByNumber.get(candidate.contractNumber);
    const supplier = contract?.supplier_id ? supplierById.get(contract.supplier_id) : null;
    const po = poByNumber.get(candidate.purchaseOrderNumber);

    let status: 'pending' | 'verified' | 'conflict' | 'not_found' = 'pending';
    let reason = 'Candidato extraído de planilla contractual; requiere contraste con OC canónica.';

    if (!contract) {
      status = 'conflict';
      reason = 'El contrato fuente no existe en la tabla canónica de contratos.';
    } else if (!po) {
      status = 'not_found';
      reason = 'La OC indicada en la planilla no existe todavía en el staging Laudus de MOTIL.';
    } else if (supplier?.rut && po.supplier_tax_id && normalize(supplier.rut) !== normalize(po.supplier_tax_id)) {
      status = 'conflict';
      reason = 'La OC existe, pero el RUT del proveedor no coincide con el proveedor contractual.';
    } else {
      status = 'verified';
      reason = 'OC Laudus encontrada en staging y RUT de proveedor compatible con el contrato.';
    }

    return {
      contract_id: contract?.id || null,
      contract_number: candidate.contractNumber,
      contract_title: contract?.title || null,
      contractor_name: contract?.contractor_name || null,
      contractual_supplier: supplier ? { id: supplier.id, name: supplier.name, rut: supplier.rut } : null,
      purchase_order_number: candidate.purchaseOrderNumber,
      status,
      reason,
      laudus_purchase_order: po ? {
        id: po.id,
        external_id: po.external_id,
        laudus_purchase_order_id: po.laudus_purchase_order_id,
        order_number: po.order_number || po.external_id,
        supplier_tax_id: po.supplier_tax_id,
        supplier_name: po.supplier_name,
        issued_date: po.issued_date,
        total_amount: po.total_amount,
        currency: po.currency,
        status: po.status,
        reconciliation_status: po.reconciliation_status,
        canonical_purchase_order_id: po.canonical_purchase_order_id,
        synced_at: po.synced_at,
      } : null,
      provenance: {
        source_file: candidate.sourceFile,
        source_file_sha256: candidate.sourceFileSha256,
        source_sheet: candidate.sourceSheet,
        source_cell: candidate.sourceCell,
        source_text: candidate.sourceText,
      },
    };
  });

  return NextResponse.json({
    data: items,
    summary: {
      total: items.length,
      verified: items.filter((item) => item.status === 'verified').length,
      pending: items.filter((item) => item.status === 'pending').length,
      conflicts: items.filter((item) => item.status === 'conflict').length,
      not_found: items.filter((item) => item.status === 'not_found').length,
      contracts_covered: new Set(items.map((item) => item.contract_number)).size,
    },
    policy: {
      promotion: 'Una OC sólo se considera verificada cuando existe en staging Laudus y el RUT del proveedor es compatible con el contrato.',
      no_inference: 'La planilla Legal aporta candidatos y provenance; no convierte por sí sola una OC en verdad financiera.',
      payment_link: 'El vínculo factura/pago por contrato sólo se habilita después de verificar la OC.',
    },
  });
}
