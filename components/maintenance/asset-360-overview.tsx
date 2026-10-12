'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { Locale } from '@/lib/i18n/dictionaries';
import { AssetCommunications } from '@/components/maintenance/asset-communications';
import {
  Activity,
  AlertTriangle,
  Gauge,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';
import {
  number,
} from '@/components/maintenance/asset-360/format';
import {
  Asset360ActionableWorkOrder,
  Asset360AttentionCard,
} from '@/components/maintenance/asset-360/attention-card';
import {
  Asset360AvailabilitySection,
  Asset360OperationalState,
} from '@/components/maintenance/asset-360/availability-section';
import {
  Asset360EconomicHistoryRow,
  Asset360EconomicsSection,
} from '@/components/maintenance/asset-360/economics-section';
import {
  Asset360HeaderMetric,
  Asset360IdentityHeader,
} from '@/components/maintenance/asset-360/identity-header';
import {
  Asset360MaintenanceSection,
  Asset360NextPreventive,
  Asset360Reliability,
  Asset360RuntimeReliability,
} from '@/components/maintenance/asset-360/maintenance-section';
import {
  Asset360CoverageSection,
  Asset360FinanceReconciliation,
  Asset360IdentityHistoryRow,
} from '@/components/maintenance/asset-360/coverage-section';
import { Asset360LifecycleSection } from '@/components/maintenance/asset-360/lifecycle-section';
import {
  Asset360MaterialsSection,
  Asset360PartsRow,
} from '@/components/maintenance/asset-360/materials-section';
import {
  Asset360AuditedIntervention,
  Asset360HistorySection,
  Asset360RecentEvent,
} from '@/components/maintenance/asset-360/history-section';
import {
  Asset360DrillingSection,
  Asset360DrillEconomics,
  Asset360DrillEconomicsChange,
  Asset360DrillingHistoryRow,
  Asset360DrillingMaintenanceReviewRow,
  Asset360DrillOperationalEvidence,
} from '@/components/maintenance/asset-360/drilling-section';
import {
  Asset360MaintenancePlanningRow,
  Asset360MaintenancePriority,
  Asset360PlanningSection,
} from '@/components/maintenance/asset-360/planning-section';
import {
  Asset360InterventionSection,
  Asset360MaintenanceTaskCandidate,
  Asset360StandardJobPlan,
} from '@/components/maintenance/asset-360/intervention-section';
import {
  Asset360MeterHistoryRow,
  Asset360RuntimeCostIntelligence,
  Asset360RuntimeSection,
} from '@/components/maintenance/asset-360/runtime-section';
import {
  Asset360CostCenterPurchaseLine,
  Asset360ProcurementOrder,
  Asset360PurchaseHistorySummary,
  Asset360PurchaseSection,
  Asset360SupplyChainRow,
} from '@/components/maintenance/asset-360/purchase-section';

type Asset360Response = {
  generatedAt?: string | null;
  unavailableSources?: string[];
  asset?: {
    id: string;
    asset_code?: string | null;
    name?: string | null;
    asset_type?: string | null;
    category?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    serial_number?: string | null;
    license_plate?: string | null;
    cost_center_code?: string | null;
    cost_center_name?: string | null;
    location?: string | null;
    criticality?: string | null;
    operational_status?: string | null;
    meter_unit?: string | null;
    mobility_class?: string | null;
    lifecycle_state?: string | null;
    lifecycle_reason?: string | null;
    acquisition_date?: string | null;
    acquisition_cost?: number | string | null;
    expected_lifespan_years?: number | string | null;
    baseline_mtbf_hours?: number | string | null;
    source_file?: string | null;
    source_sheet?: string | null;
    source_row?: number | null;
    imported_at?: string | null;
    updated_at?: string | null;
    is_active?: boolean | null;
    validation_status?: string | null;
    cost_center_evidence_source?: string | null;
    location_evidence_source?: string | null;
    location_evidence_at?: string | null;
    criticality_evidence_source?: string | null;
    criticality_evidence_at?: string | null;
    operational_status_evidence_source?: string | null;
    operational_status_evidence_at?: string | null;
    operational_status_reason?: string | null;
    reference_manufacturer?: string | null;
    reference_manufacturer_evidence_source?: string | null;
    reference_manufacturer_evidence_at?: string | null;
    reference_family?: string | null;
    reference_family_evidence_source?: string | null;
    reference_family_evidence_at?: string | null;
    license_plate_evidence_source?: string | null;
    license_plate_evidence_at?: string | null;
  };
  summary?: {
    activeWorkOrders: number;
    criticalOpen: number;
    operationalBlockers: number;
    readyToClose: number;
    pendingPlanSteps: number;
    overduePreventives: number;
  };
  runtime?: {
    reading_count?: number;
    last_reading_at?: string | null;
    latest_meter_hours?: number | string | null;
    latest_meter_unit?: string | null;
    observed_operating_hours?: number | string | null;
    reset_count?: number;
    usable_for_rate_metrics?: boolean;
  } | null;
  reliability?: Asset360Reliability;
  runtimeReliability?: Asset360RuntimeReliability;
  nextPreventive?: Asset360NextPreventive;
  recentEvents?: Asset360RecentEvent[];
  auditedInterventions?: Asset360AuditedIntervention[];
  laborEntries?: Array<{
    id: string;
    work_order_id?: string | null;
    technician_id?: string | null;
    technician_name?: string | null;
    hours?: number | string | null;
    hourly_cost?: number | string | null;
    total_cost?: number | string | null;
    started_at?: string | null;
    ended_at?: string | null;
    notes?: string | null;
    created_at?: string | null;
  }>;
  installedParts?: Asset360PartsRow[];
  pendingParts?: Asset360PartsRow[];
  economicHistory?: Asset360EconomicHistoryRow[];
  drillEconomics?: Asset360DrillEconomics;
  drillingMaintenanceReview?: Asset360DrillingMaintenanceReviewRow[];
  drillingHistory?: Asset360DrillingHistoryRow[];
  maintenanceTaskCandidates?: Asset360MaintenanceTaskCandidate[];
  standardJobPlans?: Asset360StandardJobPlan[];
  runtimeCostIntelligence?: Asset360RuntimeCostIntelligence;
  meterHistory?: Asset360MeterHistoryRow[];
  drillOperationalEvidence?: Asset360DrillOperationalEvidence;
  drillEconomicsChange?: Asset360DrillEconomicsChange;
  maintenancePriority?: Asset360MaintenancePriority;
  financeReconciliation?: Asset360FinanceReconciliation;
  identityHistory?: Asset360IdentityHistoryRow[];
  operatingSpine?: {
    last_work_order_at?: string | null;
    last_drilling_date?: string | null;
    last_cost_event_at?: string | null;
    last_telemetry_at?: string | null;
    evidence_domain_count?: number | string | null;
  } | null;
  operationalState?: Asset360OperationalState;
  supplyChain?: Asset360SupplyChainRow[];
  purchaseHistorySummary?: Asset360PurchaseHistorySummary;
  costCenterPurchaseHistory?: Asset360CostCenterPurchaseLine[];
  procurementOrders?: Asset360ProcurementOrder[];
  maintenancePlanning?: Asset360MaintenancePlanningRow[];
  canEdit?: boolean;
  closeReadiness?: Asset360ActionableWorkOrder[];
};

const fetcher = async (url: string): Promise<Asset360Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la ficha 360 operacional');
  return payload;
};

export function Asset360Overview({
  assetId,
  scope = 'equipos',
  locale = 'es',
}: {
  assetId: string;
  scope?: 'equipos' | 'vehiculos';
  locale?: Locale;
}) {
  const [origin, setOrigin] = useState('https://www.motil.app');
  const { data, error, isLoading, mutate } = useSWR<Asset360Response>(
    assetId ? `/api/maintenance/assets/${encodeURIComponent(assetId)}/operational-360` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const noun = scope === 'vehiculos' ? 'Vehículo' : 'Equipo';
  const basePath = `/dashboard/mantenimiento/${scope}/${encodeURIComponent(assetId)}`;
  const qrTargetUrl = `${origin}${basePath}/ficha`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(qrTargetUrl)}`;

  if (isLoading) {
    return (
      <StatePanel
        tone="loading"
        title={`Preparando ${noun} 360°`}
        description="Cargando información del activo."
      />
    );
  }

  if (error || !data?.asset) {
    return (
      <StatePanel
        tone="error"
        title={`No fue posible preparar ${noun} 360°`}
        description={error instanceof Error ? error.message : 'No se encontró el activo solicitado.'}
        actions={
          <Button variant="outline" onClick={() => void mutate()}>
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
        }
      />
    );
  }

  const asset = data.asset;
  const summary = data.summary || {
    activeWorkOrders: 0,
    criticalOpen: 0,
    operationalBlockers: 0,
    readyToClose: 0,
    pendingPlanSteps: 0,
    overduePreventives: 0,
  };
  const runtime = data.runtime;
  const nextPreventive = data.nextPreventive;
  const actionableWorkOrder =
    data.closeReadiness?.find((row) => row.work_order_id && !row.ready_to_close) ||
    data.closeReadiness?.find((row) => row.work_order_id) ||
    null;

  const defendableNextPreventiveMeter = Boolean(
    nextPreventive?.effective_current_meter != null &&
    !(
      Number(nextPreventive.effective_current_meter) === 0 &&
      String(nextPreventive.meter_evidence_source || '').toLowerCase() === 'schedule_snapshot'
    )
  );
  const effectiveMeterUnit = String(
    data.runtimeCostIntelligence?.latest_meter_unit || asset.meter_unit || 'h',
  ).trim().toLowerCase();
  const usesAnnualControl = ['anual', 'annual'].includes(effectiveMeterUnit);
  const effectiveMeterLabel =
    effectiveMeterUnit === 'km'
      ? 'Odómetro'
      : effectiveMeterUnit === 'h'
        ? 'Horómetro'
        : usesAnnualControl
          ? 'Periodicidad'
          : 'Medidor';
  const meterIsScheduleReference =
    data.runtimeCostIntelligence?.meter_evidence_source === 'schedule_snapshot' &&
    !data.runtimeCostIntelligence?.last_reading_at;
  const effectiveMeterDisplayLabel = meterIsScheduleReference
    ? `${effectiveMeterLabel} de pauta`
    : effectiveMeterLabel;
  const effectiveMeterSuffix = effectiveMeterUnit || '';

  const metrics: Asset360HeaderMetric[] = [
    ['OT activas', summary.activeWorkOrders, Wrench],
    ['Preventivos vencidos', summary.overduePreventives, AlertTriangle],
    ['Bloqueos operativos', summary.operationalBlockers, Activity],
    [
      effectiveMeterDisplayLabel,
      runtime?.latest_meter_hours != null
        ? `${number(runtime.latest_meter_hours, 1)} h`
        : data.runtimeCostIntelligence?.latest_meter_hours != null
          ? `${number(data.runtimeCostIntelligence.latest_meter_hours, 1)} ${effectiveMeterSuffix}`.trim()
          : defendableNextPreventiveMeter
            ? `${number(nextPreventive?.effective_current_meter, 1)} ${asset.meter_unit || 'h'}`.trim()
            : usesAnnualControl
              ? 'Anual'
              : 'Sin lectura',
      Gauge,
    ],
  ];

  const criticalityLabel: Record<string, string> = {
    critical: 'Crítica',
    high: 'Alta',
    media: 'Media',
    medium: 'Media',
    low: 'Baja',
    alta: 'Alta',
    baja: 'Baja',
  };
  const statusLabel: Record<string, string> = {
    active: 'Operativo',
    maintenance: 'En mantención',
    inactive: 'Inactivo',
    out_of_service: 'Fuera de servicio',
  };
  const displayCriticality = asset.criticality
    ? criticalityLabel[String(asset.criticality).toLowerCase()] || asset.criticality
    : null;
  const displayStatus = asset.operational_status
    ? statusLabel[String(asset.operational_status).toLowerCase()] || asset.operational_status
    : null;

  const recentEvents = data.recentEvents || [];
  const auditedInterventions = data.auditedInterventions || [];
  const laborEntries = data.laborEntries || [];
  const installedParts = data.installedParts || [];
  const pendingParts = data.pendingParts || [];
  const maintenancePlanning = data.maintenancePlanning || [];
  const hasAnnualReadingConflict = maintenancePlanning.some((row) => {
    const unit = String(row.meter_unit || '').trim().toLowerCase();
    return ['anual', 'annual'].includes(unit) && row.current_reading != null;
  });
  const operationalState = data.operationalState;
  const operatingSpine = data.operatingSpine;
  const maintenancePriority = data.maintenancePriority;
  const runtimeCostIntelligence = data.runtimeCostIntelligence;
  const maintenanceTaskCandidates = data.maintenanceTaskCandidates || [];
  const standardJobPlans = data.standardJobPlans || [];
  const meterHistory = data.meterHistory || [];
  const drillOperationalEvidence = data.drillOperationalEvidence;
  const drillEconomicsChange = data.drillEconomicsChange;
  const financeReconciliation = data.financeReconciliation;
  const identityHistory = data.identityHistory || [];
  const supplyChain = data.supplyChain || [];
  const procurementOrders = data.procurementOrders || [];
  const costCenterPurchaseHistory = data.costCenterPurchaseHistory || [];
  const purchaseHistorySummary = data.purchaseHistorySummary;
  const openSupplyNeedsCount = supplyChain.reduce(
    (sum, row) => sum + Number(row.open_supply_need_count || 0),
    0,
  );
  const materialShortageCount = supplyChain.reduce(
    (sum, row) => sum + Number(row.material_shortage_count || 0),
    0,
  );
  const economicHistory = data.economicHistory || [];
  const drillingHistory = data.drillingHistory || [];
  const drillEconomics = data.drillEconomics;
  const drillingMaintenanceReview = data.drillingMaintenanceReview || [];
  const recentDrillingMeters = drillingHistory.reduce(
    (sum, row) => {
      const value = Number(row.drilled_meters);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    },
    0,
  );
  const consolidatedDrillingMeters =
    operationalState?.drilled_meters != null
      ? Math.max(Number(operationalState.drilled_meters) || 0, 0)
      : recentDrillingMeters;
  const consolidatedDrillingReports =
    operationalState?.drilling_report_count != null
      ? Number(operationalState.drilling_report_count) || 0
      : drillingHistory.length;
  const latestPlan = maintenancePlanning[0] || null;
  const acquisitionDate = asset.acquisition_date ? new Date(String(asset.acquisition_date)) : null;
  const assetAgeYears =
    acquisitionDate && !Number.isNaN(acquisitionDate.getTime())
      ? Math.max((Date.now() - acquisitionDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 0)
      : null;
  const expectedLifespan =
    asset.expected_lifespan_years != null ? Number(asset.expected_lifespan_years) : null;
  const remainingLifeYears =
    assetAgeYears != null && expectedLifespan != null
      ? Math.max(expectedLifespan - assetAgeYears, 0)
      : null;
  const operationalEvidenceDates = [
    operatingSpine?.last_work_order_at,
    operatingSpine?.last_drilling_date,
    operatingSpine?.last_cost_event_at,
    operatingSpine?.last_telemetry_at,
  ].filter(Boolean) as string[];
  const lastOperationalEvidenceAt = operationalEvidenceDates
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time)[0]?.value || null;
  const latestEvidence = [
    { value: lastOperationalEvidenceAt, source: 'Operación' },
    { value: latestPlan?.updated_at || null, source: 'Planificación' },
    { value: runtimeCostIntelligence?.last_reading_at || null, source: effectiveMeterLabel },
  ]
    .filter((item): item is { value: string; source: string } => Boolean(item.value))
    .map((item) => ({ ...item, time: new Date(item.value).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time)[0] || null;

  const hasPurchaseEvidence = Number(purchaseHistorySummary?.purchaseLines || 0) > 0 || procurementOrders.length > 0;
  const hasMaintenanceEvidence = auditedInterventions.length > 0 || Number(operationalState?.work_order_count || 0) > 0;
  const hasMaterialEvidence = installedParts.length > 0 || pendingParts.length > 0 || supplyChain.length > 0;
  const hasProductionEvidence = drillingHistory.length > 0 || Number(operationalState?.drilling_report_count || 0) > 0;
  const hasRuntimeEvidence =
    meterHistory.length > 0 ||
    Number(runtimeCostIntelligence?.reading_count || 0) > 0 ||
    runtimeCostIntelligence?.latest_meter_hours != null ||
    defendableNextPreventiveMeter;
  const hasEconomicEvidence = economicHistory.length > 0 || Number(operationalState?.recognized_cost_event_count || 0) > 0;
  const hasLifecycleEvidence = Boolean(
    asset.acquisition_date ||
    asset.acquisition_cost != null ||
    expectedLifespan != null ||
    remainingLifeYears != null ||
    assetAgeYears != null
  );

  const coverageItems = [
    ['Identidad base', Boolean(asset.asset_code && asset.name), asset.asset_code && asset.name ? 'Disponible' : 'Incompleta'],
    ['Centro de costo', Boolean(asset.cost_center_code), asset.cost_center_code ? 'Disponible' : 'No resuelto'],
    ['Ubicación', Boolean(asset.location), asset.location ? 'Disponible' : 'No resuelta'],
    ['Criticidad', Boolean(asset.criticality), asset.criticality ? 'Disponible' : 'No resuelta'],
    ['Estado operacional', Boolean(asset.operational_status), asset.operational_status ? 'Disponible' : 'Sin estado validado'],
    ['Plan de mantención', Boolean(maintenancePriority || latestPlan), maintenancePriority || latestPlan ? 'Disponible' : 'No registrado'],
    [
      usesAnnualControl ? 'Periodicidad de control' : 'Horómetro / uso',
      usesAnnualControl || hasRuntimeEvidence,
      hasAnnualReadingConflict
        ? 'Anual · lectura numérica por validar'
        : usesAnnualControl
          ? 'Anual'
          : hasRuntimeEvidence
            ? 'Disponible'
            : 'Sin lectura defendible',
    ],
    ['Economía / costos', hasEconomicEvidence, hasEconomicEvidence ? 'Disponible' : 'Sin movimientos'],
    ['Compras / proveedores', hasPurchaseEvidence, hasPurchaseEvidence ? 'Disponible' : 'Sin compras enlazadas'],
    ['OT / mantenciones', hasMaintenanceEvidence, hasMaintenanceEvidence ? 'Disponible' : 'Sin OT enlazadas'],
    ['Materiales / repuestos', hasMaterialEvidence, hasMaterialEvidence ? 'Disponible' : 'Sin movimientos enlazados'],
    ['Vida útil', expectedLifespan != null || asset.acquisition_date != null, expectedLifespan != null || asset.acquisition_date != null ? 'Disponible' : 'No informada'],
    ['Producción / actividad', hasProductionEvidence || recentEvents.length > 0, hasProductionEvidence || recentEvents.length > 0 ? 'Disponible' : 'Sin actividad enlazada'],
  ] as const;
  const coverageAvailableCount = coverageItems.filter(([, available]) => available).length;
  const coverageMissingCount = coverageItems.length - coverageAvailableCount;
  const planningPriorityText = String(maintenancePriority?.priority || '');

  return (
    <div className="space-y-5">
      <Asset360IdentityHeader
        asset={asset}
        assetNoun={noun}
        basePath={basePath}
        displayCriticality={displayCriticality}
        displayStatus={displayStatus}
        metrics={metrics}
      />

      <AssetCommunications assetId={asset.id} locale={locale} />

      <Asset360AttentionCard
        criticalOpen={summary.criticalOpen}
        overduePreventives={summary.overduePreventives}
        operationalBlockers={summary.operationalBlockers}
        pendingPlanSteps={summary.pendingPlanSteps}
        planningPriorityText={planningPriorityText}
        actionableWorkOrder={actionableWorkOrder}
        maintenancePriority={maintenancePriority}
      />

      <Asset360MaintenanceSection
        nextPreventive={nextPreventive}
        pendingPlanSteps={summary.pendingPlanSteps}
        readyToClose={summary.readyToClose}
        criticalOpen={summary.criticalOpen}
        overduePreventives={summary.overduePreventives}
        operationalBlockers={summary.operationalBlockers}
        runtimeResetCount={Number(runtime?.reset_count || 0)}
        actionableWorkOrder={actionableWorkOrder}
        reliability={data.reliability}
        runtimeReliability={data.runtimeReliability}
      />

      <Asset360AvailabilitySection
        operationalState={operationalState}
        generatedAt={data.generatedAt}
      />

      <Asset360EconomicsSection
        economicHistory={economicHistory}
        operationalState={operationalState}
        lastCostEventAt={operatingSpine?.last_cost_event_at}
      />

      <Asset360PurchaseSection
        hasPurchaseEvidence={hasPurchaseEvidence}
        supplyChain={supplyChain}
        procurementOrders={procurementOrders}
        costCenterPurchaseHistory={costCenterPurchaseHistory}
        purchaseHistorySummary={purchaseHistorySummary}
        openSupplyNeedsCount={openSupplyNeedsCount}
        materialShortageCount={materialShortageCount}
        costCenterCode={asset.cost_center_code}
      />

      <Asset360InterventionSection
        maintenanceTaskCandidates={maintenanceTaskCandidates}
        standardJobPlans={standardJobPlans}
      />

      <Asset360RuntimeSection
        hasRuntimeEvidence={hasRuntimeEvidence}
        runtimeCostIntelligence={runtimeCostIntelligence}
        meterHistory={meterHistory}
        effectiveMeterLabel={effectiveMeterLabel}
        effectiveMeterSuffix={effectiveMeterSuffix}
        effectiveMeterDisplayLabel={effectiveMeterDisplayLabel}
        meterIsScheduleReference={meterIsScheduleReference}
      />

      <Asset360PlanningSection
        planningPriorityText={planningPriorityText}
        maintenancePriority={maintenancePriority}
        latestPlan={latestPlan}
        canEdit={data.canEdit}
        assetCode={asset.asset_code}
        assetName={asset.name}
      />

      <Asset360DrillingSection
        drillingHistory={drillingHistory}
        recentDrillingMeters={recentDrillingMeters}
        consolidatedDrillingMeters={consolidatedDrillingMeters}
        consolidatedDrillingReports={consolidatedDrillingReports}
        lastDrillingDate={operatingSpine?.last_drilling_date}
        drillOperationalEvidence={drillOperationalEvidence}
        drillEconomics={drillEconomics}
        drillEconomicsChange={drillEconomicsChange}
        drillingMaintenanceReview={drillingMaintenanceReview}
      />

      <Asset360HistorySection
        auditedInterventions={auditedInterventions}
        recentEvents={recentEvents}
        laborEntries={laborEntries}
      />

      <Asset360MaterialsSection
        hasMaterialEvidence={hasMaterialEvidence}
        pendingParts={pendingParts}
        installedParts={installedParts}
        latestPlanPartsStatus={latestPlan?.parts_status_raw}
      />

      <Asset360LifecycleSection
        hasLifecycleEvidence={hasLifecycleEvidence}
        assetAgeYears={assetAgeYears}
        expectedLifespan={expectedLifespan}
        remainingLifeYears={remainingLifeYears}
        acquisitionDate={asset.acquisition_date}
        acquisitionCost={asset.acquisition_cost}
      />

      <Asset360CoverageSection
        coverageItems={coverageItems}
        coverageAvailableCount={coverageAvailableCount}
        coverageMissingCount={coverageMissingCount}
        asset={asset}
        displayCriticality={displayCriticality}
        displayStatus={displayStatus}
        effectiveMeterLabel={effectiveMeterLabel}
        effectiveMeterSuffix={effectiveMeterSuffix}
        meterHours={runtimeCostIntelligence?.latest_meter_hours}
        meterEvidenceSource={runtimeCostIntelligence?.meter_evidence_source}
        usesAnnualControl={usesAnnualControl}
        hasAnnualReadingConflict={hasAnnualReadingConflict}
        latestEvidence={latestEvidence}
        evidenceDomainCount={operatingSpine?.evidence_domain_count}
        financeReconciliation={financeReconciliation}
        identityHistory={identityHistory}
      />
    </div>
  );
}
