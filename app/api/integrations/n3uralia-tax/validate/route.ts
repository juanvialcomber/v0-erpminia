export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { validateTaxDocument } from '@/lib/integrations/n3uralia-tax/client';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La validación tributaria requiere permisos de administración.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Solicitud tributaria inválida.' }, { status: 400 });

  try {
    const result = await validateTaxDocument(body);
    return NextResponse.json({
      ...result,
      source: 'n3uralia-tax-core',
      validatedOnly: true,
      siiWritesRequested: false,
      laudusMutated: false,
    });
  } catch (error) {
    const status = Number((error as any)?.status || 502);
    return NextResponse.json({
      ok: false,
      error: status === 422 ? 'El documento tributario no cumple el contrato.' : 'No fue posible validar el documento tributario.',
      validatedOnly: true,
      siiWritesRequested: false,
    }, { status: status === 422 ? 422 : 502 });
  }
}
