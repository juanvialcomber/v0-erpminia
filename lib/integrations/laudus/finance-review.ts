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

type MotilSupplier = {
  id: string;
  name: string | null;
};

const normalizeName = (value: string | null | undefined) =>
  String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const numberValue = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / 86400000);

async function readOpenInvoices(db: SupabaseClient, organizationId: string) {
  const rows: LaudusInvoice[] = [];
  const batchSize = 500;

  for (let offset = 0; offset < 5000; offset += batchSize) {
    const result = await db
      .from('laudus_purchase_invoice_payment_status_service_v1')
      .select(
        'purchase_invoice_external_id,doc_number,supplier_name,issued_date,due_date,total_amount,outstanding_amount,payment_status',
      )
      .eq('organization_id', organizationId)
      .gt('total_amount', 0)
      .gt('outstanding_amount', 0)
      .range(offset, offset + batchSize - 1);

    if (result.error) throw new Error(result.error.message);
    const batch = (result.data || []) as LaudusInvoice[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }

  return rows;
}

async function readSuppliers(db: SupabaseClient, organizationId: string) {
  const rows: MotilSupplier[] = [];
  const batchSize = 500;

  for (let offset = 0; offset < 5000; offset += batchSize) {
    const result = await db
      .from('suppliers')
      .select('id,name')
      .eq('organization_id', organizationId)
      .range(offset, offset + batchSize - 1);

    if (result.error) throw new Error(result.error.message);
    const batch = (result.data || []) as MotilSupplier[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }

  return rows;
}

function priorityFor(row: LaudusInvoice, supplierMatched: boolean, today: Date) {
  const due = row.due_date ? new Date(row.due_date) : null;
  const outstanding = numberValue(row.outstanding_amount);
  const overdueDays = due && due < today ? Math.max(0, daysBetween(due, today)) : 0;

  let agePoints = 0;
  if (overdueDays >= 90) agePoints = 45;
  else if (overdueDays >= 30) agePoints = 35;
  else if (overdueDays > 0) agePoints = 25;
  else if (due) agePoints = 10;

  let amountPoints = 0;
  if (outstanding >= 10_000_000) amountPoints = 30;
  else if (outstanding >= 3_000_000) amountPoints = 20;
  else if (outstanding >= 1_000_000) amountPoints = 10;

  const paymentPoints = row.payment_status === 'partially_paid' ? 10 : 0;
  const identityPoints = supplierMatched ? 0 : 15;
  const score = agePoints + amountPoints + paymentPoints + identityPoints;

  return {
    score: Math.min(score, 100),
    overdueDays,
    level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    breakdown: {
      age: agePoints,
      amount: amountPoints,
      payment: paymentPoints,
      identity: identityPoints,
    },
  } as const;
}

export async function loadLaudusFinanceReview(
  db: SupabaseClient,
  organizationId: string,
) {
  const [rows, suppliers] = await Promise.all([
    readOpenInvoices(db, organizationId),
    readSuppliers(db, organizationId),
  ]);

  const supplierCandidates = new Map<string, MotilSupplier[]>();
  for (const supplier of suppliers) {
    const key = normalizeName(supplier.name);
    if (!key) continue;
    const matches = supplierCandidates.get(key) || [];
    matches.push(supplier);
    supplierCandidates.set(key, matches);
  }

  const today = new Date();
  const queue = rows.map((row) => {
    const supplierKey = normalizeName(row.supplier_name);
    const matches = supplierKey ? supplierCandidates.get(supplierKey) || [] : [];
    const matchedSupplier = matches.length === 1 ? matches[0] : undefined;
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
      scoreBreakdown: priority.breakdown,
      evidence: [
        matchedSupplier ? 'Proveedor identificado por nombre exacto y único' : 'Proveedor pendiente de identidad',
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
  const highPriorityAmount = queue
    .filter((row) => row.priority === 'high')
    .reduce((sum, row) => sum + row.outstandingAmount, 0);

  const topQueue = queue.slice(0, 10);
  let feedbackAvailable = false;
  const latestFeedback = new Map<
    string,
    {
      decision: string;
      reason: string | null;
      actorName: string | null;
      createdAt: string;
    }
  >();

  if (topQueue.length) {
    const feedbackResult = await db
      .from('laudus_finance_review_feedback_service_v1')
      .select('purchase_invoice_external_id,decision,reason,actor_name,created_at')
      .eq('organization_id', organizationId)
      .in(
        'purchase_invoice_external_id',
        topQueue.map((row) => row.id),
      )
      .order('created_at', { ascending: false });

    if (!feedbackResult.error) {
      feedbackAvailable = true;
      for (const feedback of feedbackResult.data || []) {
        if (!latestFeedback.has(feedback.purchase_invoice_external_id)) {
          latestFeedback.set(feedback.purchase_invoice_external_id, {
            decision: feedback.decision,
            reason: feedback.reason,
            actorName: feedback.actor_name,
            createdAt: feedback.created_at,
          });
        }
      }
    }
  }

  return {
    summary: {
      openDocuments: queue.length,
      matchedSupplierDocuments,
      unresolvedSupplierDocuments: queue.length - matchedSupplierDocuments,
      overdueDocuments,
      highPriorityDocuments,
      highPriorityAmount,
      highPriorityAmountShare: outstandingTotal
        ? Math.round((highPriorityAmount / outstandingTotal) * 1000) / 10
        : 0,
      outstandingTotal,
      supplierCoverage: queue.length
        ? Math.round((matchedSupplierDocuments / queue.length) * 1000) / 10
        : 0,
    },
    feedbackAvailable,
    queue: topQueue.map((row) => ({
      ...row,
      feedback: latestFeedback.get(row.id) ?? null,
    })),
    method: {
      identity: 'exact_unique_normalized_supplier_name',
      ranking: 'deterministic_v1',
      poMatching: 'deferred_until_canonical_coverage_improves',
      automaticPromotion: false,
      humanReviewRequired: true,
    },
  };
}
