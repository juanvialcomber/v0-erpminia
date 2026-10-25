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
    connectedDomains?: string[];
    connectedDomainCount?: number;
    weeklyPlanning?: {
      sessions?: number;
      decisionsOpened?: number;
      uniqueAssetsEngaged?: number;
      preparedDecisionCount?: number;
      medianDecisionLatencySeconds?: number | null;
      actions?: Record<string, number>;
      latestAt?: string | null;
      evidenceLevel?: string;
      semantics?: string;
    };
    crossDomainCycle?: {
      intakeToOrder?: { samples?: number; medianSeconds?: number | null };
      orderToReceipt?: { samples?: number; medianSeconds?: number | null };
      receiptToInstall?: { samples?: number; medianSeconds?: number | null };
      semantics?: string;
    };
    standardPlanLearning?: {
      motilDecisions?: number;
      approved?: number;
      rejected?: number;
      editedPlans?: number;
      editEvents?: number;
      acceptanceRatePct?: number | null;
      correctionRatePct?: number | null;
      medianDecisionCycleSeconds?: number | null;
      evidenceLevel?: string;
      semantics?: string;
    };
    supplyChain?: {
      workOrders?: number;
      withMaterials?: number;
      withShortages?: number;
      withProcurementRequests?: number;
      withPurchaseOrders?: number;
      withPartsInstalled?: number;
      procurementCommitment?: number;
      tracedPartsCost?: number;
      funnel?: {
        workOrdersObserved?: number;
        withRequirements?: number;
        withShortage?: number;
        withRequest?: number;
        withOrder?: number;
        withDeliveredOrder?: number;
        withInstalledParts?: number;
        closedWithOpenShortage?: number;
        semantics?: string;
      };
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

export default function ValueScorecardPage() {
  const { data, error, isLoading } = useSWR<ApiResponse>('/api/value/scorecard', fetcher, {
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
  const maintenanceTimerCoverage = maintenanceValue.timerCoverage ?? null;
  const recurrence7d = maintenanceValue.recurrence7d || {};
  const shortageToProcurement = maintenanceValue.shortageToProcurement || {};
  const weeklyPlanning = maintenanceValue.weeklyPlanning || {};
  const standardPlanLearning = maintenanceValue.standardPlanLearning || {};
  const crossDomainCycle = maintenanceValue.crossDomainCycle || {};
  const supplyFunnel = maintenanceValue.supplyChain?.funnel || {};
  const maintenanceL4Calibrated = (weeklyPlanning.decisionsOpened || 0) >= 20 && (standardPlanLearning.motilDecisions || 0) >= 20;
  const maintenanceE3Candidate = (crossDomainCycle.receiptToInstall?.samples || 0) >= 3 && (maintenanceValue.closedWorkOrders || 0) >= 10;
  const maintenanceCChainComplete =
    (supplyFunnel.withRequest || 0) > 0 &&
    (supplyFunnel.withOrder || 0) > 0 &&
    (supplyFunnel.withDeliveredOrder || 0) > 0 &&
    (supplyFunnel.withInstalledParts || 0) > 0;

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

      <section aria-label="Gates L E C de Mantención" className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3">
        <div className="flex flex-col bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">L · decisión asistida</p>
          <p className="mt-2 text-xl font-semibold">{maintenanceL4Calibrated ? 'L4 calibrado' : 'L4 en calibración'}</p>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            {maintenanceL4Calibrated
              ? 'Hay volumen suficiente de decisiones y planes MOTIL revisados para evaluar calidad antes de considerar autonomía controlada.'
              : `Faltan ${Math.max(0, 20 - Number(weeklyPlanning.decisionsOpened || 0))} decisiones semanales y ${Math.max(0, 20 - Number(standardPlanLearning.motilDecisions || 0))} decisiones sobre planes MOTIL para calibrar L4.`}
          </p>
          <Link href="/dashboard/mantenimiento/planificacion" className="mt-4 text-sm font-medium text-primary hover:underline">
            Generar evidencia L →
          </Link>
        </div>
        <div className="flex flex-col bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">E · evidencia</p>
          <p className="mt-2 text-xl font-semibold">{maintenanceE3Candidate ? 'Candidato E3' : 'E2 medido'}</p>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            {maintenanceE3Candidate
              ? 'Existe base suficiente para buscar impacto operacional atribuible con comparación antes/después.'
              : 'Primero necesitamos ciclos completos recepción→instalación y outcomes repetidos. No se declara ahorro antes de eso.'}
          </p>
          <Link href="/dashboard/mantenimiento/ordenes-trabajo" className="mt-4 text-sm font-medium text-primary hover:underline">
            Completar outcomes E →
          </Link>
        </div>
        <div className="flex flex-col bg-card px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">C · proceso crítico conectado</p>
          <p className="mt-2 text-xl font-semibold">{maintenanceCChainComplete ? 'Cadena completa observada' : 'Cadena incompleta'}</p>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">
            {maintenanceCChainComplete
              ? 'Ya existe evidencia real desde Mantención hasta instalación. El próximo gate es recurrencia y dependencia operacional.'
              : 'Falta observar al menos una cadena real solicitud → OC → recepción → instalación. Tener los módulos no cuenta como C.'}
          </p>
          <Link href="/dashboard/compras" className="mt-4 text-sm font-medium text-primary hover:underline">
            Cerrar cadena C →
          </Link>
        </div>
      </section>

      <section aria-label="Planificación semanal asistida" className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ariel · decisión asistida</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Planificación semanal aprendiendo con uso real</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mide interacción y calibración humana. No convierte apertura, aprobación o velocidad de decisión en ahorro.
          </p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Sesiones', weeklyPlanning.sessions || 0],
            ['Decisiones abiertas', weeklyPlanning.decisionsOpened || 0],
            ['Activos revisados', weeklyPlanning.uniqueAssetsEngaged || 0],
            ['Planes MOTIL decididos', standardPlanLearning.motilDecisions || 0],
            ['Planes corregidos', standardPlanLearning.editedPlans || 0],
            ['Aceptación planes MOTIL', standardPlanLearning.acceptanceRatePct == null ? null : standardPlanLearning.acceptanceRatePct],
            ['Corrección planes MOTIL', standardPlanLearning.correctionRatePct == null ? null : standardPlanLearning.correctionRatePct],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-card px-5 py-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {value == null ? '—' : label.includes('planes MOTIL') && (label.startsWith('Aceptación') || label.startsWith('Corrección')) ? `${number(value)}%` : number(value)}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-px border-t bg-border md:grid-cols-2">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Mediana hasta siguiente acción</p>
            <p className="mt-1 text-xl font-semibold">{weeklyPlanning.medianDecisionLatencySeconds == null ? '—' : `${number(weeklyPlanning.medianDecisionLatencySeconds)} s`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Desde apertura de Planificación semanal hasta que Ariel abre una acción preparada por MOTIL.</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Mediana propuesta MOTIL → decisión</p>
            <p className="mt-1 text-xl font-semibold">{standardPlanLearning.medianDecisionCycleSeconds == null ? '—' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(standardPlanLearning.medianDecisionCycleSeconds) / 3600)} h`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Aprobación o descarte humano. Evidencia de calibración L4, no impacto económico.</p>
          </div>
        </div>
      </section>

      <section aria-label="Funnel inter-área de Mantención" className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">C · criticidad conectada</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Mantención → Compras → recepción → instalación</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cuenta eventos reales de la cadena. Un módulo disponible no cuenta como conexión.</p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-7">
          {[
            ['OT observadas', supplyFunnel.workOrdersObserved || 0],
            ['Con requerimientos', supplyFunnel.withRequirements || 0],
            ['Con shortage', supplyFunnel.withShortage || 0],
            ['Con solicitud', supplyFunnel.withRequest || 0],
            ['Con OC', supplyFunnel.withOrder || 0],
            ['Con recepción', supplyFunnel.withDeliveredOrder || 0],
            ['Con instalación', supplyFunnel.withInstalledParts || 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-card px-4 py-4">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{number(value)}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-px border-t bg-border md:grid-cols-3">
          {([
            { label: 'Solicitud → OC', metric: crossDomainCycle.intakeToOrder },
            { label: 'OC → recepción', metric: crossDomainCycle.orderToReceipt },
            { label: 'Recepción → instalación', metric: crossDomainCycle.receiptToInstall },
          ] as Array<{ label: string; metric?: { samples?: number; medianSeconds?: number | null } }>).map(({ label, metric }) => {
            const hours = metric?.medianSeconds == null ? null : Number(metric.medianSeconds) / 3600;
            return (
              <div key={label} className="bg-card px-5 py-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{hours == null ? 'Sin muestra' : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(hours)} h`}</p>
                <p className="mt-1 text-xs text-muted-foreground">{number(metric?.samples || 0)} ciclo(s) observados.</p>
              </div>
            );
          })}
        </div>
        <div className="border-t px-5 py-4 text-xs text-muted-foreground">
          Deuda histórica detectada: {number(supplyFunnel.closedWithOpenShortage || 0)} OT cerrada(s) conservan shortages abiertos. Se muestran como deuda de calidad de datos, no como cumplimiento actual.
        </div>
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
