export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { syncLegalContractInvoiceTraces } from '@/lib/legal/contract-invoice-trace-sync';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  try {
    const data = await syncLegalContractInvoiceTraces(context.organizationId, context.supabase, { recover: false });
    return NextResponse.json({
      data,
      conclusion: data.alreadySynced === data.matched
        ? 'Todas las facturas contractuales identificadas tienen trazabilidad recuperada.'
        : data.matched
          ? 'La identidad de factura está resuelta; falta recuperar trazabilidad de origen para algunas facturas.'
          : 'Todavía no hay facturas contractuales suficientes para recuperar trazabilidad.',
      next_action: data.recoverable > 0
        ? 'La recuperación pendiente se ejecuta automáticamente en el próximo sync de procurement.'
        : 'No hay recuperación pendiente.',
      policy: {
        read_only: true,
        no_external_calls: true,
        no_canonical_mutation: true,
      },
    });
  } catch (error) {
    console.error('[legal/invoice-trace-readiness]', error);
    return NextResponse.json({ error: 'No se pudo calcular cobertura de trazabilidad contractual' }, { status: 503 });
  }
}
