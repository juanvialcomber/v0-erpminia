export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { LEGAL_PROGRESS_MILESTONES } from '@/lib/legal/contract-progress-source';

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

  const contractNumbers = [...new Set(LEGAL_PROGRESS_MILESTONES.map((item) => item.contractNumber))];
  const { data: contracts, error } = await context.supabase
    .from('contracts')
    .select('id,contract_number,title,contractor_name,currency,contract_value,supplier_id')
    .eq('organization_id', context.organizationId)
    .in('contract_number', contractNumbers)
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'No se pudieron resolver los contratos para estados de pago' }, { status: 503 });
  }

  const byNumber = new Map((contracts || []).map((row) => [String(row.contract_number), row]));

  const candidates = LEGAL_PROGRESS_MILESTONES
    .filter((item) => number(item.progressRatio) > 0 && number(item.pendingToInvoice) > 0)
    .map((item) => {
      const contract = byNumber.get(item.contractNumber);
      const purchaseOrders = String(item.purchaseOrderNumber || '')
        .split('/')
        .map((value) => value.trim())
        .filter(Boolean);
      const sourceInvoices = item.invoices || [];

      const reasons: string[] = [];
      if (!contract) reasons.push('Contrato no resuelto en el maestro MOTIL.');
      if (!purchaseOrders.length) reasons.push('No hay OC informada en la evidencia fuente.');
      if (item.currency === 'UF' && sourceInvoices.some((invoice) => Number(invoice.retentionAmount || 0) > 0)) {
        reasons.push('La retención fuente usa una unidad distinta del monto contractual; requiere revisión humana.');
      }

      const candidateAmount = Math.max(0, number(item.pendingToInvoice));
      const reviewState = reasons.length ? 'needs_review' : 'candidate';

      return {
        id: `${item.contractNumber}-${item.sequence}`,
        contract_id: contract?.id || null,
        contract_number: item.contractNumber,
        contract_title: contract?.title || null,
        contractor_name: contract?.contractor_name || null,
        sequence: item.sequence,
        milestone_title: item.title,
        currency: item.currency,
        contract_value: number(contract?.contract_value),
        total_amount: number(item.totalAmount),
        progress_ratio: number(item.progressRatio),
        executed_amount: number(item.executedAmount),
        invoiced_amount: number(item.invoicedAmount),
        pending_to_invoice: candidateAmount,
        purchase_orders: purchaseOrders,
        source_invoice_count: sourceInvoices.length,
        review_state: reviewState,
        review_reasons: reasons,
        next_action: reviewState === 'candidate'
          ? 'Validar avance y preparar el estado de pago.'
          : 'Resolver la excepción antes de preparar el estado de pago.',
        provenance: {
          source_file: 'Planilla Avance Contratos - Con resumen.xlsx',
          source_sheet: item.sourceSheet,
          source_row: item.sourceRow,
        },
      };
    })
    .sort((a, b) => {
      if (a.review_state !== b.review_state) return a.review_state === 'needs_review' ? -1 : 1;
      return b.pending_to_invoice - a.pending_to_invoice;
    });

  return NextResponse.json({
    data: candidates,
    summary: {
      candidates: candidates.length,
      ready_for_review: candidates.filter((item) => item.review_state === 'candidate').length,
      needs_review: candidates.filter((item) => item.review_state === 'needs_review').length,
    },
    policy: {
      calculation: 'Monto candidato = pendiente de facturar informado en la evidencia contractual estructurada.',
      authority: 'MOTIL prepara el borrador. Legal valida avance, retención, OC y respaldo antes de cualquier estado de pago o solicitud financiera.',
      no_inference: 'Un candidato de estado de pago no es una aprobación, factura ni autorización de pago.',
    },
  });
}
