'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';

type Scorecard = {
  connectedData?: Record<string, number>;
  assistedDecision?: {
    matchReviews?: number;
    supplyDecisions?: number;
    supplyActions?: number;
    matchAcceptanceRate?: number | null;
    averageMatchReviewSeconds?: number | null;
  };
  outcomes?: {
    closed?: number;
    positive?: number;
    positiveRate?: number | null;
    falsePositives?: number;
    averageRiskReduction?: number | null;
    averageTimeToOutcomeHours?: number | null;
  };
  observedImpact?: {
    records?: number;
    e3Records?: number;
    observedMinutes?: number;
    observedValueClp?: number;
    accountingTruth?: boolean;
    auditedSavings?: boolean;
  };
  evidenceLevel?: string;
  workflowLevel?: number;
  adoptionGate?: Record<string, string>;
  scaleGate?: string;
};

type BaselineResponse = {
  sampleCount?: number;
  medianSecondsPerCase?: number | null;
  latestAt?: string | null;
  semantics?: string;
};

type ApiResponse = {
  current?: Scorecard | null;
  financeReview?: {
    total?: number;
    reviewed?: number;
    deferred?: number;
    rejected?: number;
    latestAt?: string | null;
    calibrationGate?: string;
    reviewedAmountClp?: number;
    acceptedAmountClp?: number;
    semantics?: string;
  } | null;
  financeReviewTiming?: {
    sample?: number;
    medianSeconds?: number | null;
    semantics?: string;
  } | null;
  maintenanceValue?: {
    workOrders?: number;
    closedWorkOrders?: number;
    timerInstrumentedWorkOrders?: number;
    timerCoverage?: number | null;
    assignmentCoverage?: number | null;
    assetCoverage?: number | null;
    rootCauseCoverage?: number | null;
    preventiveActionCoverage?: number | null;
    meterCoverage?: number | null;
    assignmentCoverageCount?: number;
    assetCoverageCount?: number;
    rootCauseCoverageCount?: number;
    preventiveActionCoverageCount?: number;
    meterCoverageCount?: number;
    emergencyWorkOrders?: number;
    emergencyCycle?: {
      detectedToRegistered?: { samples?: number; medianSeconds?: number | null };
      registeredToStart?: { samples?: number; medianSeconds?: number | null };
      startToClose?: { samples?: number; medianSeconds?: number | null };
      closeToApproval?: { samples?: number; medianSeconds?: number | null };
      endToEnd?: { samples?: number; medianSeconds?: number | null };
      semantics?: string;
    };
    observedExecutionSeconds?: number;
    observedExecutionHours?: number;
    workOrdersWithEvents?: number;
    eventCount?: number;
    measurableExecutionCycles?: number;
    medianExecutionCycleSeconds?: number | null;
    medianExecutionCycleHours?: number | null;
    recurrence7d?: {
      matured?: number;
      recurrent?: number;
      ratePct?: number | null;
      semantics?: string;
    };
    shortageToProcurement?: {
      samples?: number;
      medianSeconds?: number | null;
      semantics?: string;
    };
    evidenceLevel?: string;
    workflowLevel?: number;
    lec?: {
      level?: string;
      evidence?: string;
      coverage?: string | null;
      valueLevel?: string;
      coverageNumerator?: number;
      coverageDenominator?: number;
      coveragePct?: number | null;
      coverageSemantics?: string;
    };
    connectedDomains?: string[];
    connectedDomainCount?: number;
    supplyChain?: {
      workOrders?: number;
      withMaterials?: number;
      withShortages?: number;
      withProcurementRequests?: number;
      withPurchaseOrders?: number;
      withPartsInstalled?: number;
      procurementCommitment?: number;
      tracedPartsCost?: number;
    };
    adminInteraction?: {
      creationSamples?: number;
      medianCreateSeconds?: number | null;
      closeSamples?: number;
      medianCloseSeconds?: number | null;
      semantics?: string;
    };
    impactGate?: {
      open?: {
        manualSamples?: number;
        assistedSamples?: number;
        manualMedianSeconds?: number | null;
        assistedMedianSeconds?: number | null;
        comparisonReady?: boolean;
        reductionPct?: number | null;
      };
      close?: {
        manualSamples?: number;
        assistedSamples?: number;
        manualMedianSeconds?: number | null;
        assistedMedianSeconds?: number | null;
        comparisonReady?: boolean;
        reductionPct?: number | null;
      };
      e3Ready?: boolean;
      v5Ready?: boolean;
      v6Ready?: boolean;
      e4Ready?: boolean;
      recurrencePositivePeriods?: number;
      recurrenceRequiredPeriods?: number;
      semantics?: string;
    };
    recurrence?: {
      periods?: Array<{
        period?: string;
        createSamples?: number;
        closeSamples?: number;
        createdWorkOrders?: number;
        closedWorkOrders?: number;
        comparable?: boolean;
        valueClp?: number | null;
        positive?: boolean;
      }>;
      positivePeriods?: number;
      requiredPositivePeriods?: number;
      e4Ready?: boolean;
      semantics?: string;
    };
    economicValue?: {
      planningHourlyCostClp?: number | null;
      executionHourlyCostClp?: number | null;
      createdLast30?: number;
      closedLast30?: number;
      openSavedSecondsPerCase?: number;
      closeSavedSecondsPerCase?: number;
      openMonthlyValueClp?: number;
      closeMonthlyValueClp?: number;
      attributedMonthlyValueClp?: number | null;
      semantics?: string;
    };
    valueGate?: {
      attribution?: string;
      pricingReadiness?: string;
      nextMeasurement?: string;
      semantics?: string;
    };
    semantics?: string;
  } | null;
  history?: { count?: number; series?: Array<Record<string, unknown>> } | null;
};

const fetcher = async (url: string): Promise<ApiResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el scorecard');
  return payload;
};

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-CL').format(value)
    : '—';

const money = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
    : '—';

const duration = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(seconds / 60)} min`;
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(seconds / 3600)} h`;
};

export default function ValueScorecardPage() {
  const { data, error, isLoading, mutate: mutateScorecard } = useSWR<ApiResponse>('/api/value/scorecard', fetcher, {
    refreshInterval: 15 * 60 * 1000,
  });
  const baseline = useSWR<BaselineResponse>('/api/value/finance-baseline', async (url: string) => {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el baseline.');
    return payload;
  });
  const baselineStartedAt = useRef<number | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [baselineNotice, setBaselineNotice] = useState<string | null>(null);
  const maintenanceBaseline = useSWR<BaselineResponse>('/api/value/maintenance-baseline', async (url: string) => {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el baseline de Mantención.');
    return payload;
  });
  const maintenanceBaselineStartedAt = useRef<number | null>(null);
  const [maintenanceBaselineRunning, setMaintenanceBaselineRunning] = useState(false);
  const [maintenanceBaselineNotice, setMaintenanceBaselineNotice] = useState<string | null>(null);
  const maintenanceCloseBaseline = useSWR<BaselineResponse>('/api/value/maintenance-baseline?phase=close', async (url: string) => {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el baseline de cierre.');
    return payload;
  });
  const maintenanceCloseBaselineStartedAt = useRef<number | null>(null);
  const [maintenanceCloseBaselineRunning, setMaintenanceCloseBaselineRunning] = useState(false);
  const [maintenanceCloseBaselineNotice, setMaintenanceCloseBaselineNotice] = useState<string | null>(null);
  const hourlyCosts = useSWR('/api/value/maintenance-hourly-cost', async (url: string) => {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los costos hora.');
    return payload;
  });
  const [hourlyCostNotice, setHourlyCostNotice] = useState<string | null>(null);

  const score = data?.current || {};
  const decisions = (score.assistedDecision?.matchReviews || 0) + (score.assistedDecision?.supplyDecisions || 0);
  const outcomes = score.outcomes?.closed || 0;
  const financeReview = data?.financeReview || {};
  const financeReviewTiming = data?.financeReviewTiming || {};
  const financeReviewTotal = financeReview.total || 0;
  const e3 = score.observedImpact?.e3Records || 0;
  const gates = score.adoptionGate || {};
  const scaleLabel =
    score.scaleGate === 'SCALE'
      ? 'Listo para escalar'
      : score.scaleGate === 'CONDITIONAL'
        ? 'En validación'
        : score.scaleGate || '—';
  const historyCount = data?.history?.count || 0;
  const baselineSampleCount = baseline.data?.sampleCount || 0;
  const assistedTimingSample = financeReviewTiming.sample || 0;
  const manualMedian = baseline.data?.medianSecondsPerCase ?? null;
  const assistedMedian = financeReviewTiming.medianSeconds ?? null;
  const timingComparisonReady =
    baselineSampleCount >= 3 &&
    assistedTimingSample >= 20 &&
    manualMedian != null &&
    assistedMedian != null &&
    manualMedian > 0;
  const observedTimeReductionPct = timingComparisonReady
    ? Math.round(((manualMedian - assistedMedian) / manualMedian) * 100)
    : null;
  const observedSecondsRecoveredPerCase =
    timingComparisonReady && manualMedian != null && assistedMedian != null
      ? Math.max(0, manualMedian - assistedMedian)
      : null;
  const observedHoursRecovered =
    observedSecondsRecoveredPerCase == null
      ? null
      : (observedSecondsRecoveredPerCase * financeReviewTotal) / 3600;
  const demonstratedValueClp =
    (score.observedImpact?.e3Records || 0) > 0
      ? Number(score.observedImpact?.observedValueClp || 0)
      : null;
  const reviewedAmountClp = Number(financeReview.reviewedAmountClp || 0);
  const maintenanceValue = data?.maintenanceValue || {};
  const maintenanceEvidenceIsMeasured = maintenanceValue.evidenceLevel === 'E2';
  const maintenanceManualSamples = maintenanceBaseline.data?.sampleCount || 0;
  const maintenanceManualMedian = maintenanceBaseline.data?.medianSecondsPerCase ?? null;
  const maintenanceAssistedSamples = maintenanceValue.adminInteraction?.creationSamples || 0;
  const maintenanceAssistedMedian = maintenanceValue.adminInteraction?.medianCreateSeconds ?? null;
  const maintenanceCreateComparisonReady =
    maintenanceManualSamples >= 3 &&
    maintenanceAssistedSamples >= 10 &&
    maintenanceManualMedian != null &&
    maintenanceAssistedMedian != null &&
    maintenanceManualMedian > 0;
  const maintenanceCreateReductionPct = maintenanceCreateComparisonReady
    ? Math.round(((maintenanceManualMedian - maintenanceAssistedMedian) / maintenanceManualMedian) * 100)
    : null;
  const maintenanceCloseManualSamples = maintenanceCloseBaseline.data?.sampleCount || 0;
  const maintenanceCloseManualMedian = maintenanceCloseBaseline.data?.medianSecondsPerCase ?? null;
  const maintenanceCloseAssistedSamples = maintenanceValue.adminInteraction?.closeSamples || 0;
  const maintenanceCloseAssistedMedian = maintenanceValue.adminInteraction?.medianCloseSeconds ?? null;
  const maintenanceCloseComparisonReady =
    maintenanceCloseManualSamples >= 3 &&
    maintenanceCloseAssistedSamples >= 10 &&
    maintenanceCloseManualMedian != null &&
    maintenanceCloseAssistedMedian != null &&
    maintenanceCloseManualMedian > 0;
  const maintenanceCloseReductionPct = maintenanceCloseComparisonReady
    ? Math.round(((maintenanceCloseManualMedian - maintenanceCloseAssistedMedian) / maintenanceCloseManualMedian) * 100)
    : null;
  const maintenanceTimerCoverage = maintenanceValue.timerCoverage ?? null;
  const recurrence7d = maintenanceValue.recurrence7d || {};
  const shortageToProcurement = maintenanceValue.shortageToProcurement || {};

  const saveBaseline = async () => {
    if (!baselineStartedAt.current) return;
    const durationMs = Date.now() - baselineStartedAt.current;
    const rawCases = window.prompt('¿Cuántos documentos revisaste manualmente?', '5');
    if (!rawCases) return;
    const caseCount = Number(rawCases);
    setBaselineNotice(null);
    try {
      const response = await fetch('/api/value/finance-baseline', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs, caseCount }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar el baseline.');
      setBaselineNotice(`Baseline guardado: ${number(payload.secondsPerCase)} s por caso.`);
      baselineStartedAt.current = null;
      setBaselineRunning(false);
      await baseline.mutate();
    } catch (cause) {
      setBaselineNotice(cause instanceof Error ? cause.message : 'No se pudo guardar el baseline.');
    }
  };

  const saveMaintenanceBaseline = async () => {
    if (!maintenanceBaselineStartedAt.current) return;
    const durationMs = Date.now() - maintenanceBaselineStartedAt.current;
    const rawCases = window.prompt('¿Cuántas OT abriste y asignaste manualmente?', '3');
    if (!rawCases) return;
    const caseCount = Number(rawCases);
    setMaintenanceBaselineNotice(null);
    try {
      const response = await fetch('/api/value/maintenance-baseline', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs, caseCount }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar el baseline de Mantención.');
      setMaintenanceBaselineNotice(`Baseline guardado: ${number(payload.secondsPerCase)} s por apertura manual de OT.`);
      maintenanceBaselineStartedAt.current = null;
      setMaintenanceBaselineRunning(false);
      await maintenanceBaseline.mutate();
    } catch (cause) {
      setMaintenanceBaselineNotice(cause instanceof Error ? cause.message : 'No se pudo guardar el baseline de Mantención.');
    }
  };

  const saveMaintenanceCloseBaseline = async () => {
    if (!maintenanceCloseBaselineStartedAt.current) return;
    const durationMs = Date.now() - maintenanceCloseBaselineStartedAt.current;
    const rawCases = window.prompt('¿Cuántas OT cerraste administrativamente por el método manual?', '3');
    if (!rawCases) return;
    const caseCount = Number(rawCases);
    setMaintenanceCloseBaselineNotice(null);
    try {
      const response = await fetch('/api/value/maintenance-baseline', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs, caseCount, phase: 'close' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar el baseline de cierre.');
      setMaintenanceCloseBaselineNotice(`Baseline guardado: ${number(payload.secondsPerCase)} s por cierre administrativo manual.`);
      maintenanceCloseBaselineStartedAt.current = null;
      setMaintenanceCloseBaselineRunning(false);
      await maintenanceCloseBaseline.mutate();
    } catch (cause) {
      setMaintenanceCloseBaselineNotice(cause instanceof Error ? cause.message : 'No se pudo guardar el baseline de cierre.');
    }
  };

  const saveHourlyCost = async (role: 'planning' | 'execution') => {
    const label = role === 'planning' ? 'planificación/apertura' : 'ejecución/cierre';
    const raw = window.prompt(`Costo hora cargado CLP para ${label}`);
    if (!raw) return;
    const source = window.prompt('Fuente o responsable que valida esta cifra (ej. Daniel Villarroel / Finanzas)');
    if (!source) return;
    setHourlyCostNotice(null);
    try {
      const response = await fetch('/api/value/maintenance-hourly-cost', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, hourlyCostClp: Number(raw), source }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar el costo hora.');
      setHourlyCostNotice(`Costo hora validado guardado para ${label}: ${money(payload.hourlyCostClp)}.`);
      await hourlyCosts.mutate();
      await mutateScorecard();
    } catch (cause) {
      setHourlyCostNotice(cause instanceof Error ? cause.message : 'No se pudo guardar el costo hora.');
    }
  };

  const nextActions = [
    baselineSampleCount < 3 ? `Registrar ${3 - baselineSampleCount} muestras manuales más para establecer baseline.` : null,
    assistedTimingSample < 20 ? `Registrar ${20 - assistedTimingSample} decisiones con tiempo válido para comparar desempeño.` : null,
    decisions + financeReviewTotal < 20 ? `Registrar ${20 - decisions - financeReviewTotal} decisiones humanas más para calibrar L4.` : null,
    outcomes < 5 ? `Cerrar ${5 - outcomes} resultados reales para demostrar efecto operacional.` : null,
    e3 < 3 ? `Documentar ${3 - e3} impactos E3 con evidencia económica observada.` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <section className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Valor MOTIL</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Valor demostrado</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Mide madurez operacional y evidencia económica sin confundir volumen procesado con ahorro realizado.
        </p>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error.message}</div> : null}

      <section aria-label="Valor generado por MOTIL" className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lectura interna N3uralia</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Valor generado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verde significa impacto observado con gate suficiente. Volumen bajo control se muestra aparte y nunca se convierte en ahorro.
          </p>
        </div>
        <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Valor económico demostrado</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${demonstratedValueClp != null && demonstratedValueClp > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {demonstratedValueClp == null ? 'Aún no demostrado' : money(demonstratedValueClp)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sólo impactos E3 observados. Nunca exposición ni monto priorizado.
            </p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Reducción observada de tiempo</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${observedTimeReductionPct != null && observedTimeReductionPct > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {observedTimeReductionPct == null ? 'Gate pendiente' : `${number(observedTimeReductionPct)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Requiere ≥3 baselines manuales y ≥20 decisiones asistidas cronometradas.
            </p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Capacidad recuperada observada</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${observedHoursRecovered != null && observedHoursRecovered > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {observedHoursRecovered == null ? 'Gate pendiente' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(observedHoursRecovered)} h`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Aplicada sólo a casos efectivamente revisados; todavía no monetizada.
            </p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Monto bajo control financiero</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{money(reviewedAmountClp)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monto de obligaciones con decisión humana registrada. Contexto, no ahorro.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Valor interno de Mantención" className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mantención · evidencia operacional</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Control real del trabajo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mide ejecución y trazabilidad observadas. Todavía no convierte horas registradas en ahorro económico.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-6">
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Nivel actual</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${maintenanceEvidenceIsMeasured ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              L{number(maintenanceValue.workflowLevel || 0)} · {maintenanceValue.evidenceLevel || 'E0'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">L4 significa flujo instrumentado con decisión humana; E2, desempeño medido.</p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">OT con cronómetro</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${maintenanceEvidenceIsMeasured ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {number(maintenanceValue.timerInstrumentedWorkOrders || 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {maintenanceTimerCoverage == null ? 'Sin universo medible' : `${number(maintenanceTimerCoverage)}% de cobertura actual`}
            </p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Horas de ejecución observadas</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${maintenanceEvidenceIsMeasured ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {number(maintenanceValue.observedExecutionHours || 0)} h
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Tiempo real capturado por MOTIL; no se interpreta como horas ahorradas.</p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Eventos trazados</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${maintenanceEvidenceIsMeasured ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {number(maintenanceValue.eventCount || 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Inicio, pausa, reanudación, cierre y demás evidencia operacional.</p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">Ciclo ejecución → cierre</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${maintenanceEvidenceIsMeasured ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {maintenanceValue.medianExecutionCycleHours == null ? '—' : `${number(maintenanceValue.medianExecutionCycleHours)} h`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mediana de {number(maintenanceValue.measurableExecutionCycles || 0)} OT medibles.
            </p>
          </div>
          <div className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">OT cerradas trazables</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${maintenanceEvidenceIsMeasured ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {number(maintenanceValue.closedWorkOrders || 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Base para medir MTTR, reincidencia y outcomes E3.</p>
          </div>
        </div>
      </section>

      <section aria-label="Cobertura de evidencia de Mantención" className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cobertura · calidad de evidencia</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Qué parte del trabajo ya podemos medir</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Numerador y universo real. Cobertura no significa ahorro ni mejora causal.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Responsable', maintenanceValue.assignmentCoverage, maintenanceValue.assignmentCoverageCount],
            ['Equipo', maintenanceValue.assetCoverage, maintenanceValue.assetCoverageCount],
            ['Causa raíz', maintenanceValue.rootCauseCoverage, maintenanceValue.rootCauseCoverageCount],
            ['Acción preventiva', maintenanceValue.preventiveActionCoverage, maintenanceValue.preventiveActionCoverageCount],
            ['Horómetro', maintenanceValue.meterCoverage, maintenanceValue.meterCoverageCount],
          ].map(([label, pctValue, countValue]) => <div key={String(label)} className="bg-card px-5 py-5">
            <p className="text-xs text-muted-foreground">{String(label)}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{pctValue == null ? '—' : `${number(pctValue)}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(countValue || 0)} de {number(maintenanceValue.workOrders || 0)} OT observadas.</p>
          </div>)}
        </div>
        <div className="border-t px-5 py-4 text-sm">
          <p className="font-medium">
            LEC Mantención: {maintenanceValue.lec?.level || 'L1'} / {maintenanceValue.lec?.evidence || 'E0'} / {maintenanceValue.lec?.coverage || '—'} · {maintenanceValue.lec?.valueLevel || 'V0'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cobertura completa: {number(maintenanceValue.lec?.coverageNumerator || 0)} de {number(maintenanceValue.lec?.coverageDenominator || 0)} OT cerradas
            {maintenanceValue.lec?.coveragePct == null ? '' : ` · ${number(maintenanceValue.lec.coveragePct)}%`}.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Gate E3</p>
              <p className="mt-0.5 font-semibold">{maintenanceValue.impactGate?.e3Ready ? 'PASS · comparación válida' : 'HOLD · falta cohorte comparable'}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Gate V5</p>
              <p className="mt-0.5 font-semibold">{maintenanceValue.impactGate?.v5Ready ? 'PASS · outcome favorable' : 'HOLD · sin mejora demostrada'}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Gate V6</p>
              <p className="mt-0.5 font-semibold">{maintenanceValue.impactGate?.v6Ready ? 'PASS · valor económico atribuible' : 'HOLD · falta costo validado o outcome positivo'}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Gate E4</p>
              <p className="mt-0.5 font-semibold">{maintenanceValue.impactGate?.e4Ready ? 'PASS · valor recurrente' : `HOLD · ${number(maintenanceValue.impactGate?.recurrencePositivePeriods || 0)}/${number(maintenanceValue.impactGate?.recurrenceRequiredPeriods || 3)} períodos`}</p>
            </div>
          </div>
          <p className="mt-2 font-medium">Gate de valor: {maintenanceValue.valueGate?.attribution || 'NO_MEDIBLE_AUN'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {maintenanceValue.valueGate?.nextMeasurement || 'Minutos administrativos por OT antes de MOTIL versus con MOTIL.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pricing readiness: {maintenanceValue.valueGate?.pricingReadiness || 'MARKET_ANCHORED'}. Las {number(maintenanceValue.emergencyWorkOrders || 0)} OTe observadas se medirán como cohorte separada.
          </p>
        </div>
      </section>

      <section className="rounded-xl border bg-card px-5 py-4" aria-label="Recurrencia de valor E4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gate E4 · recurrencia</p>
          <h2 className="mt-1 text-lg font-semibold">Valor sostenido por período cerrado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Requiere 3 meses cerrados comparables con valor atribuible positivo. El mes en curso no cuenta.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Períodos positivos</p>
            <p className="mt-1 text-xl font-semibold">{number(maintenanceValue.recurrence?.positivePeriods || 0)} / {number(maintenanceValue.recurrence?.requiredPositivePeriods || 3)}</p>
          </div>
          <div className="rounded-md border px-4 py-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Estado</p>
            <p className="mt-1 text-xl font-semibold">{maintenanceValue.recurrence?.e4Ready ? 'E4 · valor recurrente' : 'HOLD'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Sin snapshots sintéticos ni backfill. Sólo meses cerrados observados.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card px-5 py-4" aria-label="Costo hora validado para V6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gate V6 · monetización</p>
            <h2 className="mt-1 text-lg font-semibold">Costo hora cargado validado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sólo promedios por proceso/rol. No requiere ni expone sueldos individuales.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['planning', 'Planificación / apertura', maintenanceValue.economicValue?.planningHourlyCostClp],
            ['execution', 'Ejecución / cierre', maintenanceValue.economicValue?.executionHourlyCostClp],
          ].map(([role, label, value]) => (
            <div key={String(role)} className="rounded-md border px-4 py-3">
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="mt-1 text-xl font-semibold">{value == null ? 'Pendiente' : money(Number(value)) + '/h'}</p>
              <button type="button" onClick={() => void saveHourlyCost(role as 'planning' | 'execution')} className="mt-3 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                {value == null ? 'Registrar costo validado' : 'Actualizar costo'}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Valor administrativo atribuible / mes</p>
          <p className="mt-1 text-2xl font-semibold">
            {maintenanceValue.economicValue?.attributedMonthlyValueClp == null ? 'HOLD' : money(maintenanceValue.economicValue.attributedMonthlyValueClp)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Usa volumen real de los últimos 30 días y sólo reducciones de tiempo positivas con cohorte comparable. No representa ROI total de Mantención.
          </p>
        </div>
        {hourlyCostNotice ? <p className="mt-3 text-xs text-muted-foreground">{hourlyCostNotice}</p> : null}
      </section>

      <section aria-label="Cohorte OTe de emergencia" className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">OTe · cohorte de emergencia</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Detección → aprobación</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sólo tiempos respaldados por eventos reales. Un tramo sin timestamp queda sin medir.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Detección → registro', maintenanceValue.emergencyCycle?.detectedToRegistered],
            ['Registro → inicio', maintenanceValue.emergencyCycle?.registeredToStart],
            ['Inicio → cierre', maintenanceValue.emergencyCycle?.startToClose],
            ['Cierre → aprobación', maintenanceValue.emergencyCycle?.closeToApproval],
            ['Detección → aprobación', maintenanceValue.emergencyCycle?.endToEnd],
          ].map(([label, metric]) => {
            const row = metric as { samples?: number; medianSeconds?: number | null } | undefined;
            return <div key={String(label)} className="bg-card px-5 py-5">
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{duration(row?.medianSeconds)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{number(row?.samples || 0)} OTe medibles.</p>
            </div>;
          })}
        </div>
        <div className="border-t px-5 py-4 text-xs text-muted-foreground">
          OTe observadas: {number(maintenanceValue.emergencyWorkOrders || 0)}. La hora de detección es informada por el operador; MOTIL no la infiere desde la creación.
        </div>
      </section>

      <section className="rounded-xl border bg-card px-5 py-4" aria-label="Baseline administrativo de Mantención">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Baseline E3 · Mantención</p>
            <h2 className="mt-1 text-lg font-semibold">Baseline manual de apertura de OT</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cronometra sólo abrir una OT, registrar sus datos iniciales y asignar responsable por el método manual. No incluye reparación, espera, actualizaciones posteriores ni cierre.
            </p>
          </div>
          {!maintenanceBaselineRunning ? (
            <button
              type="button"
              onClick={() => {
                maintenanceBaselineStartedAt.current = Date.now();
                setMaintenanceBaselineRunning(true);
                setMaintenanceBaselineNotice('Medición activa. Abre y asigna las OT manualmente sin usar MOTIL y vuelve al terminar.');
              }}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Iniciar baseline Mantención
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void saveMaintenanceBaseline()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Finalizar medición
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Muestras manuales</p>
            <p className="mt-1 text-xl font-semibold">{number(maintenanceBaseline.data?.sampleCount || 0)}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Mediana manual por apertura</p>
            <p className="mt-1 text-xl font-semibold">
              {maintenanceBaseline.data?.medianSecondsPerCase == null ? '—' : `${number(maintenanceBaseline.data.medianSecondsPerCase)} s`}
            </p>
          </div>
        </div>
        {maintenanceBaselineNotice ? <p className="mt-3 text-xs text-muted-foreground">{maintenanceBaselineNotice}</p> : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border px-4 py-3">
            <p className="text-xs text-muted-foreground">Creación asistida en MOTIL</p>
            <p className="mt-1 text-xl font-semibold">
              {maintenanceValue.adminInteraction?.medianCreateSeconds == null ? '—' : `${number(maintenanceValue.adminInteraction.medianCreateSeconds)} s`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mediana sobre {number(maintenanceValue.adminInteraction?.creationSamples || 0)} OT con interacción instrumentada.
            </p>
          </div>
          <div className="rounded-md border px-4 py-3">
            <p className="text-xs text-muted-foreground">Comparación manual vs MOTIL</p>
            <p className="mt-1 text-xl font-semibold">
              {maintenanceCreateReductionPct == null ? 'HOLD' : `${number(maintenanceCreateReductionPct)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {maintenanceCreateReductionPct == null
                ? `Requiere ≥3 muestras manuales y ≥10 aperturas MOTIL instrumentadas. Actual: ${maintenanceManualSamples}/3 y ${maintenanceAssistedSamples}/10.`
                : 'Reducción observada del tiempo de apertura y asignación. Puede ser negativa si MOTIL demora más.'}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Gate inicial: ≥3 muestras manuales comparables. El tiempo mecánico y la espera permanecen fuera de esta medición.
        </p>
      </section>

      <section className="rounded-xl border bg-card px-5 py-4" aria-label="Baseline administrativo de cierre de Mantención">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gate E3 · cierre administrativo</p>
            <h2 className="mt-1 text-lg font-semibold">Baseline manual de cierre de OT</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cronometra sólo documentación final y confirmación de cierre por el método manual. Excluye reparación mecánica y tiempos de espera.
            </p>
          </div>
          {!maintenanceCloseBaselineRunning ? (
            <button
              type="button"
              onClick={() => {
                maintenanceCloseBaselineStartedAt.current = Date.now();
                setMaintenanceCloseBaselineRunning(true);
                setMaintenanceCloseBaselineNotice('Medición activa. Documenta y cierra las OT manualmente sin usar MOTIL y vuelve al terminar.');
              }}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Iniciar baseline cierre
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void saveMaintenanceCloseBaseline()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Finalizar medición
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Muestras manuales</p>
            <p className="mt-1 text-xl font-semibold">{number(maintenanceCloseManualSamples)}</p>
          </div>
          <div className="rounded-md border px-4 py-3">
            <p className="text-xs text-muted-foreground">Mediana manual</p>
            <p className="mt-1 text-xl font-semibold">{duration(maintenanceCloseManualMedian)}</p>
          </div>
          <div className="rounded-md border px-4 py-3">
            <p className="text-xs text-muted-foreground">Mediana MOTIL</p>
            <p className="mt-1 text-xl font-semibold">{duration(maintenanceCloseAssistedMedian)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(maintenanceCloseAssistedSamples)} cierres instrumentados.</p>
          </div>
        </div>
        <div className="mt-3 rounded-md border px-4 py-3">
          <p className="text-xs text-muted-foreground">Reducción observada del tiempo de cierre</p>
          <p className="mt-1 text-xl font-semibold">{maintenanceCloseReductionPct == null ? 'HOLD' : `${number(maintenanceCloseReductionPct)}%`}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {maintenanceCloseReductionPct == null
              ? `Requiere ≥3 muestras manuales y ≥10 cierres MOTIL instrumentados. Actual: ${maintenanceCloseManualSamples}/3 y ${maintenanceCloseAssistedSamples}/10.`
              : 'Comparación de igual alcance administrativo. Puede ser negativa si MOTIL demora más.'}
          </p>
        </div>
        {maintenanceCloseBaselineNotice ? <p className="mt-3 text-xs text-muted-foreground">{maintenanceCloseBaselineNotice}</p> : null}
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2" aria-label="Outcomes de Mantención">
        <div className="bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Baseline post-OT</p>
          <h3 className="mt-1 text-base font-semibold">Reincidencia a 7 días</h3>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {recurrence7d.ratePct == null ? '—' : `${number(recurrence7d.ratePct)}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {number(recurrence7d.recurrent || 0)} de {number(recurrence7d.matured || 0)} OT maduras generaron otra OT sobre el mismo activo dentro de 7 días.
          </p>
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Baseline E2. No implica que la OT anterior haya fallado ni atribuye causalidad a MOTIL.
          </p>
        </div>

        <div className="bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Handoff a Compras</p>
          <h3 className="mt-1 text-base font-semibold">Shortage → solicitud operativa</h3>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {shortageToProcurement.medianSeconds == null
              ? 'Sin muestra'
              : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(shortageToProcurement.medianSeconds) / 3600)} h`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mediana de {number(shortageToProcurement.samples || 0)} handoff(s) reales desde faltante detectado hasta solicitud creada.
          </p>
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            MOTIL detecta el faltante automáticamente; la creación de la solicitud sigue requiriendo acción humana.
          </p>
        </div>
      </section>

      <section className="rounded-xl border bg-card px-5 py-4" aria-label="Cobertura inter-área de Mantención">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cobertura inter-área</p>
            <h3 className="mt-1 text-base font-semibold">
              {number(maintenanceValue.connectedDomainCount || 0)} dominios conectados con evidencia real
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {(maintenanceValue.connectedDomains || []).length > 0
                ? (maintenanceValue.connectedDomains || []).join(' → ')
                : 'Sin cadena inter-área demostrada todavía.'}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ['Materiales', maintenanceValue.supplyChain?.withMaterials || 0],
              ['Shortages', maintenanceValue.supplyChain?.withShortages || 0],
              ['Solicitudes compra', maintenanceValue.supplyChain?.withProcurementRequests || 0],
              ['OC', maintenanceValue.supplyChain?.withPurchaseOrders || 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-28 rounded-md bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-semibold">{number(value)}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Objetivo C: Mantención → Bodega → Compras → Finanzas con evidencia de punta a punta. Sólo cuenta un dominio cuando existe un evento real, no por tener el módulo disponible.
        </p>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Nivel operacional', isLoading ? '—' : `L${score.workflowLevel || 0}`],
          ['Evidencia', isLoading ? '—' : score.evidenceLevel || 'E0'],
          ['Gate de escala', isLoading ? '—' : scaleLabel],
          ['Histórico', isLoading ? '—' : `${number(historyCount)} ${historyCount === 1 ? 'corte' : 'cortes'}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Decisiones asistidas</p>
          <p className="mt-2 text-3xl font-semibold">{number(decisions)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Revisiones humanas y decisiones de abastecimiento registradas con evidencia.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Revisiones financieras</p>
          <p className="mt-2 text-3xl font-semibold">{number(financeReviewTotal)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Prioridades Laudus revisadas por Finanzas con actor y timestamp. No equivalen a ahorro.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Latencia observada</p>
          <p className="mt-2 text-3xl font-semibold">
            {financeReviewTiming.medianSeconds == null ? '—' : `${number(financeReviewTiming.medianSeconds)} s`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Mediana desde la carga del cockpit hasta la decisión. No es aún baseline manual.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Resultados cerrados</p>
          <p className="mt-2 text-3xl font-semibold">{number(outcomes)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Casos donde MOTIL compara recomendación, acción y resultado observado.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Impacto E3 observado</p>
          <p className="mt-2 text-3xl font-semibold">{money(score.observedImpact?.observedValueClp || 0)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Sólo evidencia observada. No se presenta exposición ni monto involucrado como ahorro.
          </p>
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Qué falta para escalar</h2>
            <p className="text-sm text-muted-foreground">Los gates suben sólo con uso y resultados reales.</p>
          </div>
          <Link href="/dashboard/finanzas" className="text-sm font-medium text-primary hover:underline">Ir a Finanzas</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ['Calibración de decisiones', decisions + financeReviewTotal >= 20 ? 'PASS' : gates.matchCalibration || 'HOLD'],
            ['Resultados de abastecimiento', gates.supplyOutcomes || 'HOLD'],
            ['Evidencia de valor', gates.valueEvidence || 'HOLD'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-muted/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {nextActions.length ? nextActions.map((item) => (
            <div key={item} className="rounded-md border px-4 py-3 text-sm">{item}</div>
          )) : (
            <div className="rounded-md border px-4 py-3 text-sm">Los gates mínimos de escala están cumplidos. Corresponde medir recurrencia para E4.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Baseline manual</h2>
            <p className="text-sm text-muted-foreground">
              Cronometra una revisión real en Laudus sin asistencia de MOTIL. Recomendado: 5 documentos.
            </p>
          </div>
          {!baselineRunning ? (
            <button
              type="button"
              onClick={() => {
                baselineStartedAt.current = Date.now();
                setBaselineRunning(true);
                setBaselineNotice('Medición activa. Revisa los casos manualmente en Laudus y vuelve aquí al terminar.');
              }}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Iniciar baseline
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void saveBaseline()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Finalizar medición
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Muestras</p>
            <p className="mt-1 text-xl font-semibold">{number(baseline.data?.sampleCount || 0)}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Mediana manual por caso</p>
            <p className="mt-1 text-xl font-semibold">
              {baseline.data?.medianSecondsPerCase == null ? '—' : `${number(baseline.data.medianSecondsPerCase)} s`}
            </p>
          </div>
        </div>
        <div className="mt-3 rounded-md border px-4 py-3">
          <p className="text-xs text-muted-foreground">Reducción observada de tiempo</p>
          <p className="mt-1 text-xl font-semibold">
            {observedTimeReductionPct == null ? '—' : `${number(observedTimeReductionPct)}%`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se habilita sólo con 3 muestras manuales y 20 decisiones asistidas con tiempo válido.
          </p>
        </div>
        {baselineNotice ? <p className="mt-3 text-xs text-muted-foreground">{baselineNotice}</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Esta medición es baseline operacional; por sí sola no demuestra ahorro.
        </p>
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Cobertura conectada</h2>
        <div className="mt-4 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Proveedores', score.connectedData?.suppliers],
            ['Órdenes de compra', score.connectedData?.purchaseOrders],
            ['Facturas de compra', score.connectedData?.purchaseInvoices],
            ['Productos con riesgo', score.connectedData?.supplyRiskProducts],
            ['Señales altas', score.connectedData?.supplySignalsHigh],
            ['Señales medias', score.connectedData?.supplySignalsMedium],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">{number(value)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Estas cifras demuestran cobertura E1. No se interpretan como ahorro ni ROI.
        </p>
      </section>
    </div>
  );
}
