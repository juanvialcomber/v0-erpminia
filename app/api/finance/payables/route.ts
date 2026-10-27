export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [{ data: payables, error: payablesError }, { data: payments, error: paymentsError }] = await Promise.all([
    context.supabase.from('procurement_accounts_payable_v1').select('*').eq('organization_id', context.organizationId).order('due_date', { ascending: true, nullsFirst: true }),
    context.supabase.from('procurement_supplier_payments').select('id,organization_id,payable_id,amount,currency,payment_date,payment_reference,notes,recorded_at,reconciled_at,reconciliation_reference,reconciliation_notes').eq('organization_id', context.organizationId).order('payment_date', { ascending: false }),
  ]);
  if (payablesError || paymentsError) {
    console.error('[finance/payables]', payablesError || paymentsError);
    return NextResponse.json({ payables: [], payments: [], canEdit: access.canWrite, error: 'No se pudo cargar cuentas por pagar' }, { status: 500 });
  }
  const isUatValue = (value: unknown) => typeof value === 'string' && /^UAT-/i.test(value.trim());
  const visiblePayables = (payables || []).filter((row) =>
    !isUatValue(row.invoice_number) && !isUatValue(row.supplier_name),
  );
  const visiblePayments = (payments || []).filter((row) =>
    !isUatValue(row.payment_reference) && !isUatValue(row.reconciliation_reference),
  );

  return NextResponse.json({ payables: visiblePayables, payments: visiblePayments, canEdit: access.canWrite });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  try {
    const body = await request.json();
    const action = String(body.action || '');
    if (action === 'set_due_date') {
      const { error } = await context.supabase.rpc('set_supplier_payable_due_date_v2', { p_organization_id: context.organizationId, p_payable_id: body.payableId, p_due_date: body.dueDate });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'record_payment') {
      const { data, error } = await context.supabase.rpc('record_supplier_payment_v2', {
        p_organization_id: context.organizationId,
        p_payable_id: body.payableId,
        p_amount: body.amount,
        p_payment_date: body.paymentDate,
        p_reference: body.reference ?? null,
        p_notes: body.notes ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ paymentId: data });
    }
    if (action === 'reconcile_payment') {
      const { error } = await context.supabase.rpc('reconcile_supplier_payment_v2', {
        p_organization_id: context.organizationId,
        p_payment_id: body.paymentId,
        p_reference: body.reference,
        p_notes: body.notes ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'No se pudo completar la operación';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
