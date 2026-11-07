export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { LEGAL_PROGRESS_MILESTONES } from '@/lib/legal/contract-progress-source';

function normalize(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
}

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
  const { data: contracts, error: contractError } = await context.supabase
    .from('contracts')
    .select('id,contract_number,title,contractor_name,supplier_id,currency')
    .eq('organization_id', context.organizationId)
    .in('contract_number', contractNumbers)
    .limit(100);

  if (contractError) {
    return NextResponse.json({ error: 'No se pudieron resolver contratos' }, { status: 503 });
  }

  const contractByNumber = new Map((contracts || []).map((row) => [String(row.contract_number), row]));
  const supplierIds = [...new Set((contracts || []).map((row) => row.supplier_id).filter(Boolean))] as string[];

  const { data: payables, error: payableError } = supplierIds.length
    ? await context.supabase
        .from('procurement_accounts_payable_v1')
        .select('id,invoice_id,invoice_number,supplier_id,supplier_name,currency,approved_amount,due_date,status,paid_amount,outstanding_amount,days_to_due')
        .eq('organization_id', context.organizationId)
        .in('supplier_id', supplierIds)
        .limit(2000)
    : { data: [], error: null };

  if (payableError) {
    return NextResponse.json({ error: 'No se pudieron consultar cuentas por pagar MOTIL' }, { status: 503 });
  }

  const candidates = LEGAL_PROGRESS_MILESTONES.flatMap((milestone) => {
    const contract = contractByNumber.get(milestone.contractNumber);
    return (milestone.invoices || []).map((invoice) => {
      const exactMatches = (payables || []).filter((row) =>
        Boolean(contract?.supplier_id) &&
        row.supplier_id === contract?.supplier_id &&
        normalize(row.invoice_number) === normalize(invoice.docNumber) &&
        String(row.currency || 'CLP').toUpperCase() === String(milestone.currency || 'CLP').toUpperCase(),
      );

      let readiness:
        | 'ready_for_request'
        | 'needs_due_date'
        | 'needs_payable_promotion'
        | 'settled'
        | 'conflict'
        | 'missing_supplier' = 'needs_payable_promotion';
      let reason = 'La factura existe en la evidencia contractual, pero todavía no existe una CxP MOTIL exacta y aprobada.';
      const payable = exactMatches.length === 1 ? exactMatches[0] : null;

      if (!contract?.supplier_id) {
        readiness = 'missing_supplier';
        reason = 'El contrato no tiene proveedor canónico suficiente para vincular la factura.';
      } else if (exactMatches.length > 1) {
        readiness = 'conflict';
        reason = 'Existe más de una CxP MOTIL con el mismo proveedor, factura y moneda; requiere conciliación.';
      } else if (payable) {
        const outstanding = number(payable.outstanding_amount);
        if (outstanding <= 0 || ['paid','reconciled','cancelled'].includes(String(payable.status || '').toLowerCase())) {
          readiness = 'settled';
          reason = 'La CxP MOTIL no mantiene saldo pendiente.';
        } else if (!payable.due_date) {
          readiness = 'needs_due_date';
          reason = 'La CxP MOTIL existe con saldo, pero falta fecha de vencimiento antes de registrar o solicitar pago.';
        } else {
          readiness = 'ready_for_request';
          reason = 'Factura, proveedor, moneda, CxP, saldo y vencimiento están resueltos en MOTIL; puede prepararse una solicitud de pago para firmas.';
        }
      }

      return {
        id: `${milestone.contractNumber}-${milestone.sequence}-${normalize(invoice.docNumber)}`,
        contract_number: milestone.contractNumber,
        contract_title: contract?.title || null,
        contractor_name: contract?.contractor_name || null,
        supplier_id: contract?.supplier_id || null,
        milestone_sequence: milestone.sequence,
        milestone_title: milestone.title,
        invoice_number: invoice.docNumber,
        invoice_amount_source: number(invoice.sourceAmount),
        retention_amount_source: number(invoice.retentionAmount),
        currency: milestone.currency,
        readiness,
        reason,
        payable: payable ? {
          id: payable.id,
          invoice_id: payable.invoice_id,
          supplier_name: payable.supplier_name,
          approved_amount: number(payable.approved_amount),
          paid_amount: number(payable.paid_amount),
          outstanding_amount: number(payable.outstanding_amount),
          due_date: payable.due_date,
          status: payable.status,
          days_to_due: payable.days_to_due,
        } : null,
        next_action:
          readiness === 'ready_for_request' ? 'Preparar solicitud de pago para firmas.'
          : readiness === 'needs_due_date' ? 'Definir vencimiento en Tesorería.'
          : readiness === 'needs_payable_promotion' ? 'Revisar three-way match y promover la factura a CxP MOTIL.'
          : readiness === 'conflict' ? 'Resolver duplicidad antes de solicitar pago.'
          : readiness === 'missing_supplier' ? 'Resolver proveedor contractual.'
          : 'No requiere nueva solicitud de pago.',
        provenance: {
          source_file: 'Planilla Avance Contratos - Con resumen.xlsx',
          source_sheet: milestone.sourceSheet,
          source_row: milestone.sourceRow,
          source_text: invoice.sourceText,
        },
      };
    });
  });

  return NextResponse.json({
    data: candidates,
    summary: {
      invoices: candidates.length,
      ready_for_request: candidates.filter((item) => item.readiness === 'ready_for_request').length,
      needs_due_date: candidates.filter((item) => item.readiness === 'needs_due_date').length,
      needs_payable_promotion: candidates.filter((item) => item.readiness === 'needs_payable_promotion').length,
      conflicts: candidates.filter((item) => item.readiness === 'conflict' || item.readiness === 'missing_supplier').length,
      settled: candidates.filter((item) => item.readiness === 'settled').length,
    },
    policy: {
      gate: 'MOTIL sólo considera lista una factura cuando proveedor + número + moneda resuelven una única CxP MOTIL con saldo y vencimiento.',
      authority: 'Listo para solicitar pago no significa aprobado ni pagado. La solicitud requiere firmas y Finanzas conserva la ejecución.',
      source: 'La evidencia contractual aporta el número de factura; la CxP MOTIL aporta saldo, vencimiento y estado.',
    },
  });
}
