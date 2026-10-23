export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MOTIL_CONTRACT_BASELINE } from '@/lib/commercial/motil-contract-baseline';

const ADMIN_ROLES = new Set(['admin','superadmin','super_admin']);

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!ADMIN_ROLES.has(String(context.role || '').toLowerCase())) {
    return NextResponse.json({ error: 'Solo administración puede ver Valor MOTIL.' }, { status: 403 });
  }

  const [currentResult, historyResult] = await Promise.all([
    context.supabase.rpc('motil_value_scorecard_preview', {
      p_organization_id: context.organizationId,
    }),
    context.supabase.rpc('motil_value_scorecard_history_preview', {
      p_organization_id: context.organizationId,
      p_limit: 90,
    }),
  ]);

  if (currentResult.error || historyResult.error) {
    console.error('[admin/value-scorecard]', currentResult.error || historyResult.error);
    return NextResponse.json({ error: 'No fue posible construir el scorecard de valor.' }, { status: 500 });
  }

  const data = currentResult.data;

  const reviews = Number(data?.assistedDecision?.matchReviews || 0);
  const outcomes = Number(data?.outcomes?.closed || 0);
  const e3 = Number(data?.observedImpact?.e3Records || 0);

  const series = Array.isArray(historyResult.data?.series) ? historyResult.data.series : [];
  const latest = historyResult.data?.latest || null;
  const first = historyResult.data?.first || null;
  const latestDate = latest?.snapshot_date ? new Date(latest.snapshot_date + 'T12:00:00Z') : null;
  const target30 = latestDate ? new Date(latestDate.getTime() - 30 * 86400000) : null;

  const baseline30 = target30 && series.length
    ? [...series]
        .filter((row: any) => row?.snapshot_date)
        .sort((a: any, b: any) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())
        .reduce((best: any, row: any) => {
          const rowDate = new Date(row.snapshot_date + 'T12:00:00Z');
          if (rowDate > target30) return best;
          return !best || rowDate > new Date(best.snapshot_date + 'T12:00:00Z') ? row : best;
        }, null)
    : null;

  const comparisonBase = baseline30 || first;
  const numberAt = (row: any, path: string[]) => {
    let value = row;
    for (const key of path) value = value?.[key];
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const delta = (path: string[]) => latest && comparisonBase
    ? numberAt(latest, path) - numberAt(comparisonBase, path)
    : 0;

  const comparison = {
    mode: baseline30 ? '30d' : series.length > 1 ? 'available-history' : 'baseline-only',
    fromDate: comparisonBase?.snapshot_date || null,
    toDate: latest?.snapshot_date || null,
    daysObserved: comparisonBase?.snapshot_date && latest?.snapshot_date
      ? Math.max(0, Math.round(
          (new Date(latest.snapshot_date + 'T12:00:00Z').getTime()
            - new Date(comparisonBase.snapshot_date + 'T12:00:00Z').getTime()) / 86400000,
        ))
      : 0,
    deltas: {
      matchReviews: delta(['assisted_decision','matchReviews']),
      supplyDecisions: delta(['assisted_decision','supplyDecisions']),
      supplyActions: delta(['assisted_decision','supplyActions']),
      closedOutcomes: delta(['outcomes','closed']),
      positiveOutcomes: delta(['outcomes','positive']),
      e3Records: delta(['observed_impact','e3Records']),
      observedMinutes: delta(['observed_impact','observedMinutes']),
      observedValueClp: delta(['observed_impact','observedValueClp']),
    },
  };

  const commercialEvidence = [
    comparison.deltas.matchReviews > 0
      ? `${comparison.deltas.matchReviews} nuevas revisiones de matching registradas en el período.`
      : null,
    comparison.deltas.supplyActions > 0
      ? `${comparison.deltas.supplyActions} nuevas acciones de abastecimiento originadas desde MOTIL.`
      : null,
    comparison.deltas.closedOutcomes > 0
      ? `${comparison.deltas.closedOutcomes} resultados de abastecimiento cerrados.`
      : null,
    comparison.deltas.e3Records > 0
      ? `${comparison.deltas.e3Records} nuevos casos E3 con referencia de evidencia.`
      : null,
    comparison.deltas.observedMinutes > 0
      ? `${Math.round(comparison.deltas.observedMinutes)} minutos de impacto observado documentado.`
      : null,
  ].filter(Boolean);

  return NextResponse.json({
    ...data,
    history: historyResult.data,
    comparison,
    commercialEvidence,
    contractBaseline: MOTIL_CONTRACT_BASELINE,
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
