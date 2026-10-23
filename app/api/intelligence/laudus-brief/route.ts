export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type Signal = {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  summary: string;
  metric: string;
  action: string;
  evidence: string[];
  href: string;
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const pct = (value: number) => Math.round(value * 1000) / 10;

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rawScope = Number(request.nextUrl.searchParams.get('days') || 365);
  const scopeDays = Number.isFinite(rawScope)
    ? Math.min(Math.max(Math.trunc(rawScope), 90), 730)
    : 365;

  const [procurement, finance, documentMatch, supplyRisk] = await Promise.all([
    context.supabase.rpc('motil_laudus_procurement_summary', {
      p_organization_id: context.organizationId,
    }),
    context.supabase.rpc('motil_laudus_finance_summary', {
      p_organization_id: context.organizationId,
    }),
    context.supabase.rpc('motil_laudus_document_match_preview', {
      p_organization_id: context.organizationId,
      p_scope_days: scopeDays,
    }),
    context.supabase.rpc('motil_supply_risk_preview', {
      p_organization_id: context.organizationId,
      p_scope_days: scopeDays,
    }),
  ]);

  const firstError = procurement.error || finance.error || documentMatch.error || supplyRisk.error;
  if (firstError) {
    console.error('[intelligence/laudus-brief]', firstError);
    return NextResponse.json(
      { error: 'No fue posible construir la inteligencia Laudus de MOTIL.' },
      { status: 500 },
    );
  }

  const procurementData = procurement.data || {};
  const financeData = finance.data || {};
  const matchSummary = documentMatch.data?.summary || {};
  const riskSummary = supplyRisk.data?.summary || {};

  const totalInvoices = n(matchSummary.total_invoices);
  const strongMatches = n(matchSummary.exact_candidate) + n(matchSummary.probable);
  const ambiguous = n(matchSummary.ambiguous);
  const review = n(matchSummary.review);
  const noOrder = n(matchSummary.no_order_candidate);
  const strongMatchRate = totalInvoices ? strongMatches / totalInvoices : 0;

  const supplierTotal = n(procurementData?.suppliers?.total);
  const supplierMatched = n(procurementData?.suppliers?.matched);
  const supplierCandidates = n(procurementData?.suppliers?.new_candidate);
  const supplierMatchRate = supplierTotal ? supplierMatched / supplierTotal : 0;

  const highRisk = n(riskSummary.high_risk);
  const mediumRisk = n(riskSummary.medium_risk);
  const priceOutliers = n(riskSummary.price_outliers_20pct);
  const singleSupplier = n(riskSummary.single_supplier_products);
  const activeMaintenanceShortages = n(riskSummary.active_maintenance_shortages);
  const skuMatchRate = n(supplyRisk.data?.coverage?.laudus_sku_match_rate);

  const signals: Signal[] = [];

  if (highRisk > 0) {
    signals.push({
      id: 'supply-risk-high',
      severity: 'high',
      title: 'Abastecimiento con riesgo alto',
      summary: 'MOTIL combina stock, dependencia de proveedor y variación de precio para priorizar los casos que merecen revisión.',
      metric: `${highRisk} señales altas`,
      action: 'Revisar primero los productos con mayor riesgo y decidir si cotizar, diversificar o validar precio.',
      evidence: [
        `${mediumRisk} señales medias adicionales`,
        `${priceOutliers} productos con desviación de precio ≥20%`,
        `${singleSupplier} productos observados con un solo proveedor en la ventana`,
      ],
      href: '/dashboard/compras',
    });
  }

  if (totalInvoices > 0 && strongMatchRate < 0.5) {
    signals.push({
      id: 'document-resolution',
      severity: 'medium',
      title: 'La conciliación documental todavía requiere criterio humano',
      summary: 'El matcher es deliberadamente conservador: MOTIL no fuerza una OC cuando la evidencia no alcanza.',
      metric: `${pct(strongMatchRate)}% con candidato fuerte`,
      action: 'Priorizar revisiones de mayor confianza para mejorar cobertura sin aumentar falsos matches.',
      evidence: [
        `${strongMatches} facturas con candidato exacto/probable de ${totalInvoices}`,
        `${ambiguous} ambiguas`,
        `${review} requieren revisión`,
        `${noOrder} sin OC candidata`,
      ],
      href: '/dashboard/compras',
    });
  }

  if (supplierCandidates > 0) {
    signals.push({
      id: 'supplier-resolution',
      severity: 'medium',
      title: 'Proveedores nuevos por conciliar',
      summary: 'Laudus aporta proveedores que todavía no tienen identidad canónica confirmada en MOTIL.',
      metric: `${supplierCandidates} candidatos nuevos`,
      action: 'Resolver identidad antes de usar estos proveedores en concentración, desempeño o decisiones automáticas.',
      evidence: [
        `${supplierMatched} de ${supplierTotal} proveedores ya conciliados`,
        `${pct(supplierMatchRate)}% de cobertura de identidad`,
        '0 conflictos reportados en la última reconciliación disponible',
      ],
      href: '/dashboard/compras/proveedores-360',
    });
  }

  if (activeMaintenanceShortages === 0) {
    signals.push({
      id: 'maintenance-supply',
      severity: 'info',
      title: 'Sin quiebres activos ligados a OT',
      summary: 'Las señales de abastecimiento actuales no muestran faltantes que estén bloqueando órdenes de trabajo activas.',
      metric: '0 OT con quiebre activo',
      action: 'Mantener vigilancia; no convertir stock bajo mínimo en urgencia si no existe demanda operacional.',
      evidence: [
        `${highRisk} señales altas siguen siendo preventivas`,
        'La prioridad operacional aumenta cuando existe una necesidad activa de mantenimiento',
      ],
      href: '/dashboard/mantenimiento/gerencial',
    });
  }

  if (skuMatchRate > 0 && skuMatchRate < 0.5) {
    signals.push({
      id: 'sku-coverage',
      severity: 'info',
      title: 'Cobertura Laudus ↔ inventario aún parcial',
      summary: 'La inteligencia de precio y proveedor sólo debe usarse donde la identidad de producto está suficientemente resuelta.',
      metric: `${pct(skuMatchRate)}% SKU vinculados`,
      action: 'Seguir conciliando productos de mayor uso y criticidad antes de ampliar recomendaciones.',
      evidence: [
        `${n(riskSummary.laudus_matched_products)} productos MOTIL vinculados a evidencia Laudus`,
        'Las señales sin vínculo Laudus no deben presentarse como evidencia de proveedor',
      ],
      href: '/dashboard/bodega/laudus',
    });
  }

  const severityRank = { high: 0, medium: 1, info: 2 } as const;
  signals.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return NextResponse.json({
    source: 'Laudus',
    product: 'MOTIL Intelligence',
    readOnly: true,
    scopeDays,
    generatedAt: new Date().toISOString(),
    freshness: {
      purchaseOrdersLatest: procurementData?.purchase_orders?.latest_issued_date || null,
      invoicesLatest: financeData?.invoices?.latest_issued_date || null,
      purchaseOrdersSyncedAt: procurementData?.purchase_orders?.synced_at || null,
      invoicesSyncedAt: financeData?.invoices?.synced_at || null,
    },
    coverage: {
      supplierMatchRate,
      skuMatchRate,
      strongDocumentMatchRate: strongMatchRate,
    },
    signals: signals.slice(0, 5),
    guardrails: {
      invoiceDueDateIsNotPaymentStatus: true,
      stockMinimumIsNotAutomaticUrgency: true,
      candidateIsNotCanonicalMatch: true,
      noAutomaticPurchase: true,
      noLaudusWrite: true,
    },
  });
}
