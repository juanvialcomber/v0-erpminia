import type { SupabaseClient } from '@supabase/supabase-js';

type LaudusInvoice = {
  purchase_invoice_external_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  issued_date: string | null;
  due_date: string | null;
  total_amount: number | string | null;
  outstanding_amount: number | string | null;
  payment_status: string | null;
};

type LaudusInvoiceSource = {
  external_id: string;
  supplier_tax_id: string | null;
};

type MotilSupplier = {
  id: string;
  name: string | null;
  rut: string | null;
};

const normalizeTaxId = (value: string | null | undefined) =>
  String(value || '').toLowerCase().replace(/[^0-9k]/g, '');

const numberValue = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / 86400000);

function priorityFor(row: LaudusInvoice, supplierMatched: boolean, today: Date) {
  const due = row.due_date ? new Date(row.due_date) : null;
  const outstanding = numberValue(row.outstanding_amount);
  const overdueDays = due && due < today ? Math.max(0, daysBetween(due, today)) : 0;

  let score = 0;
  if (overdueDays >= 90) score += 45;
  else if (overdueDays >= 30) score += 35;
  else if (overdueDays > 0) score += 25;
  else if (due) score += 10;

  if (outstanding >= 10_000_000) score += 30;
  else if (outstanding >= 3_000_000) score += 20;
  else if (outstanding >= 1_000_000) score += 10;

  if (row.payment_status === 'partially_paid') score += 10;
  if (!supplierMatched) score += 15;

  return {
    score: Math.min(score, 100),
    overdueDays,
    level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
  } as const;
}

export async function loadLaudusFinanceReview(
  db: SupabaseClient,
  organizationId: string,
) {
  const [statusResult, sourceResult, suppliersResult] = await Promise.all([
    db
      .schema('integration')
      .from('laudus_purchase_invoice_payment_status_v1')
      .select(
        'purchase_invoice_external_id,doc_number,supplier_name,issued_date,due_date,total_amount,outstanding_amount,payment_status',
      )
      .eq('organization_id', organizationId)
      .gt('total_amount', 0)
      .gt('outstanding_amount', 0)
      .limit(2000),
    db
      .schema('integration')
      .from('laudus_purchase_invoices')
      .select('external_id,supplier_tax_id')
      .eq('organization_id', organizationId)
      .limit(2000),
    db
      .from('suppliers')
      .select('id,name,rut')
      .eq('organization_id', organizationId)
      .not('rut', 'is', null)
      .limit(5000),
  ]);

  if (statusResult.error) throw new Error(statusResult.error.message);
  if (sourceResult.error) throw new Error(sourceResult.error.message);
  if (suppliersResult.error) throw new Error(suppliersResult.error.message);

  const rows = (statusResult.data || []) as LaudusInvoice[];
  const sourceRows = (sourceResult.data || []) as LaudusInvoiceSource[];
  const suppliers = (suppliersResult.data || []) as MotilSupplier[];

  const sourceByExternalId = new Map(
    sourceRows.map((row) => [row.external_id, row]),
  );
  const supplierByTaxId = new Map<string, MotilSupplier>();
  for (const supplier of suppliers) {
    const key = normalizeTaxId(supplier.rut);
    if (key && !supplierByTaxId.has(key)) supplierByTaxId.set(key, supplier);
  }

  const today = new Date();
  const queue = rows.map((row) => {
    const source = sourceByExternalId.get(row.purchase_invoice_external_id);
    const taxId = normalizeTaxId(source?.supplier_tax_id);
    const matchedSupplier = taxId ? supplierByTaxId.get(taxId) : undefined;
    const priority = priorityFor(row, Boolean(matchedSupplier), today);

    return {
      id: row.purchase_invoice_external_id,
      documentNumber: row.doc_number,
      supplierName: row.supplier_name,
      supplierMatched: Boolean(matchedSupplier),
      motilSupplierId: matchedSupplier?.id ?? null,
      motilSupplierName: matchedSupplier?.name ?? null,
      issuedDate: row.issued_date,
      dueDate: row.due_date,
      totalAmount: numberValue(row.total_amount),
      outstandingAmount: numberValue(row.outstanding_amount),
      paymentStatus: row.payment_status,
      overdueDays: priority.overdueDays,
      priorityScore: priority.score,
      priority: priority.level,
      evidence: [
        matchedSupplier ? 'Proveedor verificado por RUT' : 'Proveedor pendiente de identidad',
        row.payment_status === 'partially_paid' ? 'Pago parcial registrado en Laudus' : 'Sin pago aplicado en Laudus',
        priority.overdueDays > 0 ? `${priority.overdueDays} días vencido` : 'No vencido',
      ],
      nextAction: matchedSupplier
        ? 'Revisar respaldo OC/recepción antes de promover a CxP MOTIL'
        : 'Resolver identidad del proveedor antes de conciliar',
    };
  });

  queue.sort((a, b) =>
    b.priorityScore - a.priorityScore ||
    b.outstandingAmount - a.outstandingAmount ||
    b.overdueDays - a.overdueDays
  );

  const matchedSupplierDocuments = queue.filter((row) => row.supplierMatched).length;
  const overdueDocuments = queue.filter((row) => row.overdueDays > 0).length;
  const highPriorityDocuments = queue.filter((row) => row.priority === 'high').length;
  const outstandingTotal = queue.reduce((sum, row) => sum + row.outstandingAmount, 0);

  return {
    summary: {
      openDocuments: queue.length,
      matchedSupplierDocuments,
      unresolvedSupplierDocuments: queue.length - matchedSupplierDocuments,
      overdueDocuments,
      highPriorityDocuments,
      outstandingTotal,
      supplierCoverage: queue.length
        ? Math.round((matchedSupplierDocuments / queue.length) * 1000) / 10
        : 0,
    },
    queue: queue.slice(0, 10),
    method: {
      identity: 'exact_supplier_tax_id',
      ranking: 'deterministic_v1',
      poMatching: 'deferred_until_canonical_coverage_improves',
      automaticPromotion: false,
      humanReviewRequired: true,
    },
  };
}
