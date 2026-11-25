export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const statuses = new Set(['identity_missing','ambiguous','currency_missing','laudus_only','motil_only','invoice_difference','approval_missing','payment_difference','candidate_consistent']);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const status = request.nextUrl.searchParams.get('status');
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
  if ((status && !statuses.has(status)) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json({ error: 'Filtro o página no válidos.' }, { status: 400 });
  }
  // The organization is resolved from the authenticated session, never from query parameters.
  const { data, error } = await context.supabase.rpc('motil_invoice_reconciliation_v1', {
    p_organization_id: context.organizationId,
    p_status: status || null,
    p_offset: (page - 1) * 50,
    p_limit: 50,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    console.error('[finance/invoice-reconciliation] lookup failed', error?.code);
    return NextResponse.json({ error: 'No se pudo comparar las facturas. Intenta nuevamente.' }, { status: 503 });
  }
  const summary = data.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return NextResponse.json({ error: 'No se pudo verificar el resumen de conciliación.' }, { status: 503 });
  }
  const count = (key: string) => {
    const value = summary[key];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  // Coverage is not an error. A candidate is not an approved reconciliation.
  const groups = [
    { status: 'invoice_difference', count: count('invoice_difference'), action: 'Contrastar documento original, moneda y total.' },
    { status: 'payment_difference', count: count('payment_difference'), action: 'Contrastar comprobantes de pago y saldo pendiente.' },
    { status: 'ambiguous', count: count('ambiguous'), action: 'Verificar identidad y tipo de documento antes de vincular.' },
    { status: 'approval_missing', count: count('approval_missing'), action: 'Verificar la obligación y su aprobación.' },
    { status: 'currency_missing', count: count('currency_missing'), action: 'Verificar moneda en el documento fuente.' },
    { status: 'identity_missing', count: count('identity_missing'), action: 'Completar RUT y folio desde el documento fuente.' },
  ].filter(group => group.count > 0);
  return NextResponse.json({ ...data, reviewPlan: {
    groups,
    coverage: { laudusOnly: count('laudus_only'), motilOnly: count('motil_only') },
    candidates: count('candidate_consistent'),
    persisted: false,
  } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
