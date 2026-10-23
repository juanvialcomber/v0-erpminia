export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const ADMIN_ROLES = new Set(['admin','superadmin','super_admin']);

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!ADMIN_ROLES.has(String(context.role || '').toLowerCase())) {
    return NextResponse.json({ error: 'Solo administración puede ver Valor MOTIL.' }, { status: 403 });
  }

  const { data, error } = await context.supabase.rpc('motil_value_scorecard_preview', {
    p_organization_id: context.organizationId,
  });

  if (error) {
    console.error('[admin/value-scorecard]', error);
    return NextResponse.json({ error: 'No fue posible construir el scorecard de valor.' }, { status: 500 });
  }

  const reviews = Number(data?.assistedDecision?.matchReviews || 0);
  const outcomes = Number(data?.outcomes?.closed || 0);
  const e3 = Number(data?.observedImpact?.e3Records || 0);

  return NextResponse.json({
    ...data,
    generatedAt: new Date().toISOString(),
    narrative: {
      demonstrated: [
        'Laudus está conectado a Compras y Finanzas con trazabilidad.',
        'MOTIL prioriza excepciones y riesgos de abastecimiento con reglas explicables.',
        'Existe workflow humano para aprobar/rechazar matches y decidir acciones de abastecimiento.',
      ],
      nextEvidence: [
        reviews < 20 ? 'Completar 20 revisiones de matching para calibración observada.' : null,
        outcomes < 5 ? 'Cerrar al menos 5 acciones de abastecimiento con resultado.' : null,
        e3 < 3 ? 'Registrar al menos 3 impactos E3 con referencia documental.' : null,
      ].filter(Boolean),
    },
  });
}
