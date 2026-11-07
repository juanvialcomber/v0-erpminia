export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import {
  LEGAL_CONTRACT_SOURCE_META,
  LEGAL_PROGRESS_MILESTONES,
  LEGAL_PROGRESS_SOURCE_FILE,
  LEGAL_PROGRESS_SOURCE_SHA256,
} from '@/lib/legal/contract-progress-source';

function normalizeTaxId(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9K]/gi, '').toUpperCase();
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysBetween(dateValue: string | null | undefined, today: string) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T12:00:00Z`).getTime();
  const base = new Date(`${today}T12:00:00Z`).getTime();
  if (!Number.isFinite(target) || !Number.isFinite(base)) return null;
  return Math.round((target - base) / 86400000);
}

function classifyInvoicePayment(
  paymentStatus: string | null | undefined,
  outstandingAmount: number,
  retentionAmount: number,
) {
  if (paymentStatus === 'paid' || outstandingAmount <= 1) return 'paid';
  if (
    paymentStatus === 'partially_paid' &&
    retentionAmount > 0 &&
    Math.abs(outstandingAmount - retentionAmount) <= Math.max(5, retentionAmount * 0.001)
  ) {
    return 'paid_with_retention';
  }
  if (paymentStatus === 'partially_paid') return 'partial';
  if (paymentStatus === 'unpaid') return 'unpaid';
  return 'unknown';
}

function summarizeMilestonePayment(states: string[], expectedInvoices: number, matchedInvoices: number) {
  if (expectedInvoices === 0) return 'not_invoiced';
  if (matchedInvoices < expectedInvoices) return 'needs_reconciliation';
  if (states.every((state) => state === 'paid')) return 'paid';
  if (states.every((state) => state === 'paid' || state === 'paid_with_retention')) {
    return states.some((state) => state === 'paid_with_retention') ? 'paid_with_retention' : 'paid';
  }
  if (states.some((state) => state === 'paid' || state === 'paid_with_retention' || state === 'partial')) return 'partial';
  if (states.every((state) => state === 'unpaid')) return 'unpaid';
  return 'needs_reconciliation';
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const detailContractNumbers = new Set<string>(LEGAL_PROGRESS_MILESTONES.map((item) => item.contractNumber));
  const contractNumbers = [
    'IO-01','IO-02','IO-03','IO-04','IO-05','IO-06','IO-07','IO-08','IO-09',
    'EP-01','EP-02','EP-03','EP-04','EP-05','EP-06',
  ];
  const { data: contracts, error: contractError } = await context.supabase
    .from('contracts')
    .select('id,contract_number,title,contractor_name,contract_value,currency,paid_amount,status,supplier_id')
    .eq('organization_id', context.organizationId)
    .in('contract_number', contractNumbers);

  if (contractError) {
    return NextResponse.json({ error: 'No se pudieron cargar contratos' }, { status: 503 });
  }

  const supplierIds = [...new Set((contracts || []).map((item) => item.supplier_id).filter(Boolean))] as string[];
  const { data: suppliers, error: supplierError } = supplierIds.length
    ? await context.supabase
        .from('suppliers')
        .select('id,name,rut')
        .eq('organization_id', context.organizationId)
        .in('id', supplierIds)
    : { data: [], error: null };

  if (supplierError) {
    return NextResponse.json({ error: 'No se pudieron cargar proveedores contractuales' }, { status: 503 });
  }

  const taxIds = [...new Set((suppliers || []).map((item) => item.rut).filter(Boolean))] as string[];
  const { data: laudusSuppliers, error: laudusSupplierError } = taxIds.length
    ? await context.supabase
        .from('laudus_suppliers_service_v1')
        .select('external_id,tax_id,name,legal_name')
        .eq('organization_id', context.organizationId)
        .in('tax_id', taxIds)
    : { data: [], error: null };

  if (laudusSupplierError) {
    return NextResponse.json({ error: 'No se pudo conciliar proveedor Laudus' }, { status: 503 });
  }

  const contractByNumber = new Map((contracts || []).map((item) => [item.contract_number, item]));
  const supplierById = new Map((suppliers || []).map((item) => [item.id, item]));
  const laudusByTaxId = new Map((laudusSuppliers || []).map((item) => [normalizeTaxId(item.tax_id), item]));

  const docNumbers = [...new Set(
    LEGAL_PROGRESS_MILESTONES.flatMap((milestone) =>
      milestone.invoices.filter((invoice) => invoice.sourceAmount > 0).map((invoice) => invoice.docNumber),
    ),
  )];

  const supplierExternalIds = [...new Set((laudusSuppliers || []).map((item) => item.external_id).filter(Boolean))] as string[];
  const { data: invoiceStatuses, error: invoiceError } = supplierExternalIds.length && docNumbers.length
    ? await context.supabase
        .from('laudus_purchase_invoice_payment_status_service_v1')
        .select('purchase_invoice_external_id,doc_number,supplier_external_id,supplier_name,issued_date,total_amount,paid_amount,outstanding_amount,payment_count,last_payment_at,payment_status')
        .eq('organization_id', context.organizationId)
        .in('supplier_external_id', supplierExternalIds)
        .in('doc_number', docNumbers)
        .limit(500)
    : { data: [], error: null };

  if (invoiceError) {
    return NextResponse.json({ error: 'No se pudo consultar el estado de pagos Laudus' }, { status: 503 });
  }

  const invoiceBySupplierAndNumber = new Map(
    (invoiceStatuses || []).map((item) => [String(item.supplier_external_id) + ':' + String(item.doc_number), item]),
  );

  const milestones = LEGAL_PROGRESS_MILESTONES.map((source) => {
    const contract = contractByNumber.get(source.contractNumber);
    const supplier = contract?.supplier_id ? supplierById.get(contract.supplier_id) : null;
    const laudusSupplier = supplier?.rut ? laudusByTaxId.get(normalizeTaxId(supplier.rut)) : null;

    const positiveInvoices = source.invoices.filter((invoice) => invoice.sourceAmount > 0);
    const invoices = positiveInvoices.map((sourceInvoice) => {
      const key = String(laudusSupplier?.external_id || '') + ':' + sourceInvoice.docNumber;
      const laudusInvoice = invoiceBySupplierAndNumber.get(key);
      const outstandingAmount = money(laudusInvoice?.outstanding_amount);
      const state = laudusInvoice
        ? classifyInvoicePayment(laudusInvoice.payment_status, outstandingAmount, sourceInvoice.retentionAmount)
        : 'not_found';

      return {
        doc_number: sourceInvoice.docNumber,
        source_text: sourceInvoice.sourceText,
        source_net_amount: sourceInvoice.sourceAmount,
        source_retention_amount: sourceInvoice.retentionAmount,
        match_status: laudusInvoice ? 'verified' : 'not_found',
        payment_state: state,
        laudus: laudusInvoice
          ? {
              invoice_external_id: laudusInvoice.purchase_invoice_external_id,
              issued_date: laudusInvoice.issued_date,
              gross_amount: money(laudusInvoice.total_amount),
              paid_amount: money(laudusInvoice.paid_amount),
              outstanding_amount: outstandingAmount,
              payment_count: Number(laudusInvoice.payment_count || 0),
              last_payment_at: laudusInvoice.last_payment_at,
              payment_status: laudusInvoice.payment_status,
            }
          : null,
      };
    });

    const paymentStates = invoices.map((invoice) => invoice.payment_state);
    const paymentState = summarizeMilestonePayment(
      paymentStates,
      positiveInvoices.length,
      invoices.filter((invoice) => invoice.match_status === 'verified').length,
    );

    return {
      contract_number: source.contractNumber,
      contract_id: contract?.id || null,
      contract_title: contract?.title || null,
      contractor_name: contract?.contractor_name || null,
      contract_value: money(contract?.contract_value),
      contract_paid_amount: money(contract?.paid_amount),
      sequence: source.sequence,
      title: source.title,
      purchase_order_number: source.purchaseOrderNumber,
      currency: source.currency,
      total_amount: source.totalAmount,
      progress_ratio: source.progressRatio,
      progress_state: source.progressRatio >= 0.999 ? 'completed' : source.progressRatio > 0 ? 'in_progress' : 'not_started',
      executed_amount: source.executedAmount,
      invoiced_amount: source.invoicedAmount,
      pending_to_invoice: source.pendingToInvoice,
      payment_state: paymentState,
      invoice_count: positiveInvoices.length,
      matched_invoice_count: invoices.filter((invoice) => invoice.match_status === 'verified').length,
      invoices,
      provenance: {
        source_file: LEGAL_PROGRESS_SOURCE_FILE,
        source_file_sha256: LEGAL_PROGRESS_SOURCE_SHA256,
        source_sheet: source.sourceSheet,
        source_row: source.sourceRow,
      },
    };
  });

  const today = todayKey();
  const contractsSummary = contractNumbers.map((contractNumber) => {
    const contract = contractByNumber.get(contractNumber);
    const rows = milestones.filter((item) => item.contract_number === contractNumber);
    const sourceMeta = LEGAL_CONTRACT_SOURCE_META[
      contractNumber as keyof typeof LEGAL_CONTRACT_SOURCE_META
    ];
    const sourceTotal = rows.reduce((sum, item) => sum + money(item.total_amount), 0);
    const sourceExecuted = rows.reduce((sum, item) => sum + money(item.executed_amount), 0);
    const sourceInvoiced = rows.reduce((sum, item) => sum + money(item.invoiced_amount), 0);
    const progressRatio = sourceTotal > 0 ? sourceExecuted / sourceTotal : null;
    const contractValue = money(contract?.contract_value);
    const contractCurrency = String(contract?.currency || 'CLP');
    const comparableCurrency = rows.length > 0 && rows.every((item) => item.currency === contractCurrency);
    const financialExposure = comparableCurrency
      ? Math.max(sourceExecuted, sourceInvoiced, money(contract?.paid_amount))
      : 0;
    const overrunTolerance = Math.max(1, contractValue * 0.001);
    const budgetOverrun = comparableCurrency && contractValue > 0 && financialExposure > contractValue + overrunTolerance;
    const daysToEnd = daysBetween(sourceMeta?.endDate, today);
    const completed = progressRatio !== null && progressRatio >= 0.999;
    const attentionReasons: string[] = [];

    if (budgetOverrun) {
      attentionReasons.push('Monto ejecutado/facturado/pagado comparable supera el valor contractual por sobre la tolerancia.');
    }
    if (!completed && daysToEnd !== null && daysToEnd < 0) {
      attentionReasons.push('La fecha de término informada en la planilla fuente ya pasó y el avance estructurado no está al 100%.');
    } else if (!completed && daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= 15) {
      attentionReasons.push('La fecha de término informada en la planilla fuente vence dentro de 15 días.');
    }

    const attentionState =
      budgetOverrun || (!completed && daysToEnd !== null && daysToEnd < 0)
        ? 'red'
        : !completed && daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= 15
          ? 'yellow'
          : completed
            ? 'green'
            : 'neutral';

    return {
      contract_number: contractNumber,
      title: contract?.title || null,
      contractor_name: contract?.contractor_name || null,
      contract_value: contractValue,
      contract_currency: contractCurrency,
      contract_paid_amount: money(contract?.paid_amount),
      milestones: rows.length,
      milestones_started: rows.filter((item) => item.progress_ratio > 0).length,
      milestones_completed: rows.filter((item) => item.progress_ratio >= 0.999).length,
      milestones_paid: rows.filter((item) => item.payment_state === 'paid').length,
      milestones_retained: rows.filter((item) => item.payment_state === 'paid_with_retention').length,
      milestones_partial: rows.filter((item) => item.payment_state === 'partial').length,
      milestones_unpaid: rows.filter((item) => item.payment_state === 'unpaid').length,
      milestones_not_invoiced: rows.filter((item) => item.payment_state === 'not_invoiced').length,
      invoice_matches: rows.reduce((sum, item) => sum + item.matched_invoice_count, 0),
      invoice_expected: rows.reduce((sum, item) => sum + item.invoice_count, 0),
      detail_available: detailContractNumbers.has(contractNumber),
      source_start_date: sourceMeta?.startDate || null,
      source_end_date: sourceMeta?.endDate || null,
      source_schedule_note: sourceMeta?.note || null,
      source_progress_ratio: progressRatio,
      days_to_end: daysToEnd,
      budget_overrun: budgetOverrun,
      attention_state: attentionState,
      attention_reasons: attentionReasons,
    };
  });

  return NextResponse.json({
    data: milestones,
    contracts: contractsSummary,
    summary: {
      contracts: contractsNumbersSafe(contractNumbers),
      milestones: milestones.length,
      invoices_expected: milestones.reduce((sum, item) => sum + item.invoice_count, 0),
      invoices_matched: milestones.reduce((sum, item) => sum + item.matched_invoice_count, 0),
      retained_milestones: milestones.filter((item) => item.payment_state === 'paid_with_retention').length,
      contracts_red: contractsSummary.filter((item) => item.attention_state === 'red').length,
      contracts_yellow: contractsSummary.filter((item) => item.attention_state === 'yellow').length,
      contracts_green: contractsSummary.filter((item) => item.attention_state === 'green').length,
      source_file: LEGAL_PROGRESS_SOURCE_FILE,
      source_file_sha256: LEGAL_PROGRESS_SOURCE_SHA256,
    },
    policy: {
      physical_progress: 'El avance físico proviene de la planilla contractual de Elías y no se recalcula desde Laudus.',
      payment_truth: 'El estado de pago proviene de Laudus sólo cuando proveedor + número de factura coinciden.',
      retention: 'Pago parcial se clasifica como pagado con retención sólo cuando el saldo Laudus coincide con la retención informada en la planilla.',
      no_inference: 'MOTIL no convierte facturado en pagado ni avance físico en autorización de pago.',
      schedule: 'El semáforo usa fechas de término de la planilla fuente de Elías. Rojo/amarillo son señales de revisión, no declaraciones automáticas de incumplimiento.',
    },
  });
}

function contractsNumbersSafe(values: string[]) {
  return values.length;
}
