'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CircleDollarSign, Gauge, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type QueueRow = {
  assetId: string;
  assetCode: string | null;
  assetName: string;
  criticality: string;
  operationalStatus: string | null;
  insuredUf: number | null;
  acquisitionDate: string | null;
  acquisitionCostClp: number | null;
  recognizedCostLifetimeClp: number | null;
  recognizedCost12mClp: number | null;
  netBookValueClp: number | null;
  observedMaintenanceToBookPct: number | null;
  depreciationCurrentClp: number | null;
  depreciationConflictCount: number;
  workOrderCount: number;
  openWorkOrderCount: number;
  downtimeHours: number;
  runtimeReadings: number;
  evidenceCoveragePct: number;
  decision: { key: string; label: string; reason: string; rank: number };
};

type ReviewRow = {
  id: number;
  source_sheet: string | null;
  source_row: number | null;
  description: string | null;
  cost_center_raw: string | null;
  net_book_value: number | string | null;
  reason: { key: string; label: string; rank: number };
};

type ReviewResponse = {
  insurance: null | {
    filename: string;
    sourceRows: number;
    linkedRows: number;
    linkedAssets: number;
    unresolvedRows: number;
    unclassifiedRows: number;
    missingCandidates: number;
    ambiguousRows: number;
    discrepancies: number;
  };
  summary: {
    sourceRows: number;
    linkedRows: number;
    linkedAssets: number;
    singleAssets: number;
    conflictAssets: number;
    unresolvedRows: number;
    classifiedRows: number;
    structuredCandidateRows: number;
    structuredCandidateGroups: number;
    unstructuredRows: number;
    terminalRows: number;
    materialReviewComplete: boolean;
    materialReviewFloorClp: number;
    unexplainedOperationalRows: number;
    unexplainedOperationalBookValueClp: number;
    depreciationCoverage: {
      rows: number;
      withCurrentDepreciation: number;
      withAccumulatedDepreciation: number;
      withBookValue: number;
      withRemainingLife: number;
      linkedCanonical: number;
      linkedCanonicalAssets: number;
      reviewRequired: number;
    };
  };
  unresolved: {
    byReason: Record<string,number>;
    rows: ReviewRow[];
    limitedTo: number;
  };
  terminal: {
    rows: number;
    byReason: Record<string,number>;
  };
};

type LaudusAssetControl = {
  fixedAssets?: {
    total?: number;
    linkedToMotil?: number;
    withAcquisitionCost?: number;
    withAcquisitionDate?: number;
    withUsefulLife?: number;
    economicsReady?: boolean;
    latestSync?: string | null;
  };
  freshness?: {
    latestOperationalSync?: string | null;
    operationalSyncAgeDays?: number | null;
  };
};

type Response = {
  source: null | {
    filename: string;
    cutoffDate: string | null;
    canonical: boolean;
    authority: string | null;
  };
  summary: {
    linkedAssets: number;
    withCriticality: number;
    withMaintenanceEvidence: number;
    withRuntimeEvidence: number;
    withUsableRuntime: number;
    withCoreEconomics: number;
    withBookValue: number;
    depreciationConflicts: number;
    maintenanceAttention: number;
    economicsToComplete: number;
  };
  queue: QueueRow[];
  semantics: Record<string,string>;
};

const fetcher=async(url:string):Promise<Response>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar economía de activos');
  return payload;
};

const laudusFetcher=async(url:string):Promise<LaudusAssetControl>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar activos fijos Laudus');
  return payload;
};

const reviewFetcher=async(url:string):Promise<ReviewResponse>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar conciliación de activos');
  return payload;
};

const money=(value:number|null)=>value==null?'Sin base':new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
const uf=(value:number|null)=>value==null?'Sin base':`${new Intl.NumberFormat('es-CL',{maximumFractionDigits:2}).format(value)} UF`;
const number=(value:number,digits=0)=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:digits}).format(value);
const shortDate=(value?:string|null)=>{
  if(!value) return 'Sin sincronización';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) return 'Fecha por revisar';
  return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}).format(date);
};

function tone(key:string){
  if(key==='maintenance_attention') return 'destructive' as const;
  if(key==='complete_economics') return 'secondary' as const;
  return 'outline' as const;
}

export default function FinanceAssetsPage(){
  const {data,error,isLoading}=useSWR<Response>('/api/finance/asset-economics',fetcher,{revalidateOnFocus:false});
  const {data:reviewData,error:reviewError}=useSWR<ReviewResponse>('/api/finance/asset-reconciliation-review',reviewFetcher,{revalidateOnFocus:false});
  const {data:laudusData,error:laudusError}=useSWR<LaudusAssetControl>('/api/integrations/laudus/finance-control',laudusFetcher,{revalidateOnFocus:false,refreshInterval:15*60*1000});

  if(isLoading) return <StatePanel tone="loading" title="Preparando economía de activos" description="Conectando seguro, mantenimiento y uso observado." />;
  if(error) return <StatePanel tone="error" title="No se pudo preparar economía de activos" description={error.message} />;
  if(!data) return null;

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finanzas · Activos</p>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Economía de activos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Una cola de decisiones basada en evidencia financiera y operacional ya vinculada.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/finanzas/activos/candidatas" className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
            Candidatas Ficha 360
          </Link>
          <Link href="/dashboard/finanzas/activos/registro" className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted">
            Registro financiero completo
          </Link>
          {data.source?.canonical?<Badge variant="outline">Canónico · {data.source.authority||'Finanzas'}</Badge>:null}
        </div>
      </div>
    </section>

    <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4" aria-label="Cobertura económica de activos">
      <Metric icon={ShieldCheck} label="Activos vinculados" value={number(data.summary.linkedAssets)} detail="Seguro y/o depreciación conectados a Ficha 360" />
      <Metric icon={Wrench} label="Con historia de mantenimiento" value={number(data.summary.withMaintenanceEvidence)} detail="OT o costo reconocido enlazado" />
      <Metric icon={Gauge} label="Con medidor" value={number(data.summary.withRuntimeEvidence)} detail={`${data.summary.withUsableRuntime} con secuencia utilizable para tasas`} />
      <Metric icon={CircleDollarSign} label="Valor libro conciliado" value={number(data.summary.withBookValue)} detail={data.summary.depreciationConflicts > 0 ? `${data.summary.depreciationConflicts} activo(s) con doble registro para Daniel` : 'Depreciación canónica vinculada 1:1'} />
    </section>

    <section className="rounded-lg border bg-card" aria-label="Estado de depreciación y activos fijos">
      <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Depreciación y Laudus</p>
          <h2 className="mt-1 font-semibold">Qué está realmente disponible</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            La depreciación contable de Daniel y el maestro de activos fijos Laudus se muestran por separado hasta que la identidad del activo esté conciliada.
          </p>
        </div>
        <Link href="/dashboard/finanzas/activos/registro" className="inline-flex items-center gap-2 text-xs font-medium text-primary">
          Abrir registro completo <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {reviewError ? (
        <StatePanel tone="error" title="No se pudo cargar la depreciación" description={reviewError.message} className="border-0" />
      ) : !reviewData ? (
        <StatePanel tone="loading" title="Preparando depreciación" className="border-0" />
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <ReviewMetric
            label="Depreciación del período"
            value={`${number(reviewData.summary.depreciationCoverage.withCurrentDepreciation)}/${number(reviewData.summary.depreciationCoverage.rows)}`}
            detail="Filas de la fuente de Daniel con depreciación corriente disponible"
          />
          <ReviewMetric
            label="Valor libro"
            value={`${number(reviewData.summary.depreciationCoverage.withBookValue)}/${number(reviewData.summary.depreciationCoverage.rows)}`}
            detail="Registros con valor libro conservado desde la fuente contable"
          />
          <ReviewMetric
            label="Filas conciliadas"
            value={number(reviewData.summary.depreciationCoverage.linkedCanonical)}
            detail={`${number(reviewData.summary.depreciationCoverage.linkedCanonicalAssets)} activos únicos con identidad verificada`}
          />
          <ReviewMetric
            label="Vida útil remanente"
            value={number(reviewData.summary.depreciationCoverage.withRemainingLife)}
            detail="Registros con meses remanentes disponibles para análisis"
          />
        </div>
      )}

      <div className="grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-4">
        {laudusError ? (
          <div className="bg-card p-4 sm:col-span-2 xl:col-span-4">
            <p className="text-sm font-medium">Activos fijos Laudus no disponibles</p>
            <p className="mt-1 text-xs text-muted-foreground">{laudusError.message}</p>
          </div>
        ) : (
          <>
            <ReviewMetric label="Activos fijos Laudus" value={number(Number(laudusData?.fixedAssets?.total||0))} detail={`Última sincronización: ${shortDate(laudusData?.fixedAssets?.latestSync)}`} />
            <ReviewMetric label="Laudus ↔ MOTIL" value={number(Number(laudusData?.fixedAssets?.linkedToMotil||0))} detail="Activos fijos con identidad MOTIL ya vinculada" />
            <ReviewMetric label="Fecha + vida útil" value={number(Math.min(Number(laudusData?.fixedAssets?.withAcquisitionDate||0),Number(laudusData?.fixedAssets?.withUsefulLife||0)))} detail="Cobertura disponible en el maestro Laudus sincronizado" />
            <ReviewMetric label="Costo adquisición Laudus" value={number(Number(laudusData?.fixedAssets?.withAcquisitionCost||0))} detail="El listado sincronizado aún no expone costo; detalle se consulta de forma acotada" />
          </>
        )}
      </div>

      <div className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">
        <strong className="font-medium text-foreground">Regla:</strong> valor libro, depreciación, seguro y costo de adquisición son magnitudes distintas. MOTIL no completa una con otra ni calcula reemplazo hasta tener identidad 1:1 y evidencia financiera suficiente.
      </div>
    </section>

    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Qué revisar primero</h2>
          <p className="mt-1 text-xs text-muted-foreground">Prioridad determinística: excepción operacional, criticidad y cobertura económica. No diagnostica fallas ni recomienda reemplazo automáticamente.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge variant={data.summary.maintenanceAttention?'destructive':'outline'}>{data.summary.maintenanceAttention} mantenimiento</Badge>
          <Badge variant="secondary">{data.summary.economicsToComplete} economía incompleta</Badge>
        </div>
      </div>

      {data.queue.length===0?<StatePanel tone="neutral" title="Aún no hay activos financieros vinculados" className="border-0" />:
      <div className="divide-y">
        {data.queue.map((row)=>(
          <article key={row.assetId} className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.3fr)_130px_145px_145px_110px_minmax(220px,1fr)_42px] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{row.assetName}</p>
                <Badge variant="outline">{row.criticality}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{row.assetCode||'Sin código'} · evidencia {row.evidenceCoveragePct}%</p>
            </div>
            <Value label="Seguro" value={uf(row.insuredUf)} />
            <Value
              label="Valor libro"
              value={row.depreciationConflictCount > 1 ? 'Revisar' : money(row.netBookValueClp)}
              detail={
                row.depreciationConflictCount > 1
                  ? `${row.depreciationConflictCount} registros canónicos`
                  : row.observedMaintenanceToBookPct != null
                    ? `Mantención reconocida: ${number(row.observedMaintenanceToBookPct,1)}% del valor libro`
                    : undefined
              }
            />
            <Value label="Costo 12m" value={money(row.recognizedCost12mClp)} />
            <Value label="OT abiertas" value={number(row.openWorkOrderCount)} detail={row.downtimeHours>0?`${number(row.downtimeHours,1)} h detención`:undefined} />
            <div>
              <Badge variant={tone(row.decision.key)}>{row.decision.label}</Badge>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.decision.reason}</p>
            </div>
            <Link href={`/dashboard/mantenimiento/equipos/${encodeURIComponent(row.assetId)}/ficha`} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label={`Abrir ficha de ${row.assetName}`}>
              <ArrowRight className="h-4 w-4"/>
            </Link>
          </article>
        ))}
      </div>}
    </section>

    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Conciliación pendiente</h2>
          <p className="mt-1 text-xs text-muted-foreground">Lo que MOTIL no puede resolver sin inventar identidad. Daniel conserva autoridad sobre la fuente.</p>
        </div>
        {reviewData ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Depreciación {number(reviewData.summary.linkedRows)}/{number(reviewData.summary.sourceRows)}</Badge>
            <Badge variant={reviewData.summary.unresolvedRows ? 'secondary' : 'outline'}>
              Pendiente {number(reviewData.summary.unresolvedRows)}
            </Badge>
            {reviewData.summary.materialReviewComplete ? (
              <Badge variant="secondary">Revisión ≥ {money(reviewData.summary.materialReviewFloorClp)} completa</Badge>
            ) : null}
            {reviewData.insurance ? (
              <Badge variant="outline">Seguro {number(reviewData.insurance.linkedRows)}/{number(reviewData.insurance.sourceRows)}</Badge>
            ) : null}
            {reviewData.insurance ? (
              <Badge variant={reviewData.insurance.unclassifiedRows ? 'destructive' : 'secondary'}>
                Seguro sin clasificar {number(reviewData.insurance.unclassifiedRows)}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {reviewError ? (
        <StatePanel tone="error" title="No se pudo cargar la conciliación pendiente" description={reviewError.message} className="border-0" />
      ) : !reviewData ? (
        <StatePanel tone="loading" title="Preparando conciliación" className="border-0" />
      ) : (
        <>
          <div className="grid gap-px border-b bg-border sm:grid-cols-2 xl:grid-cols-4">
            <ReviewMetric label="Fuente depreciación" value={number(reviewData.summary.sourceRows)} detail="Filas conservadas desde el archivo de Daniel" />
            <ReviewMetric label="Activos enlazados" value={number(reviewData.summary.linkedAssets)} detail={`${number(reviewData.summary.singleAssets)} con valor 1:1`} />
            <ReviewMetric label="Pendiente operacional" value={number(reviewData.summary.unresolvedRows)} detail="Filas aún sin vínculo canónico; no equivale a datos crudos" />
            <ReviewMetric label="Clasificado / en revisión" value={number(reviewData.summary.classifiedRows)} detail="Ya tiene causa, categoría o decisión de conciliación" />
            <ReviewMetric label="Candidatos Ficha 360" value={number(reviewData.summary.structuredCandidateRows)} detail={`${number(reviewData.summary.structuredCandidateGroups)} grupos de activo/instalación ya estructurados`} />
            <ReviewMetric label="Sin estructura" value={number(reviewData.summary.unstructuredRows)} detail="Backlog realmente crudo: aún sin clasificación útil" />
            <ReviewMetric label="Cerrado financiero" value={number(reviewData.summary.terminalRows)} detail="Contexto financiero/CAPEX que no requiere Ficha 360 individual" />
            <ReviewMetric label="Sin identificador operacional" value={number(reviewData.unresolved.byReason.missing_identifier||0)} detail="Sin centro, patente, serie o nombre suficiente" />
            <ReviewMetric label="Ficha 360 faltante" value={number(reviewData.unresolved.byReason.missing_canonical_asset_candidate||0)} detail="Identificador específico sin contraparte canónica ni alias operacional" />
            <ReviewMetric label="Unidad ambigua" value={number(reviewData.unresolved.byReason.ambiguous_existing_asset_family||0)} detail="La familia existe; falta patente, serie o número de unidad" />
            <ReviewMetric label="Línea agregada" value={number(reviewData.unresolved.byReason.aggregate_multi_asset_financial_line||0)} detail="Una fila financiera representa más de un activo" />
            <ReviewMetric label="Identidad insuficiente" value={number(reviewData.unresolved.byReason.insufficient_unit_identity||0)} detail="Parece operacional, pero falta una llave de unidad verificable" />
            <ReviewMetric label="Modelo no representado" value={number(reviewData.unresolved.byReason.unrepresented_operational_model||0)} detail="Modelo específico ausente del maestro operacional" />
            <ReviewMetric label="Componente / repuesto" value={number(reviewData.unresolved.byReason.component_or_spare_financial_line||0)} detail="Capitalizado financieramente; no crea Ficha 360 de equipo" />
            <ReviewMetric label="Centro de activo sin Ficha 360" value={number(reviewData.unresolved.byReason.asset_center_without_asset||0)} detail="Centro canónico tipado como activo; falta contraparte operacional" />
            <ReviewMetric label="Centro no operacional" value={number(reviewData.unresolved.byReason.non_asset_cost_center||0)} detail="Área o administración; no se fuerza a un equipo" />
            <ReviewMetric label="Revisión secundaria" value={number(reviewData.unresolved.byReason.low_materiality_secondary_review||0)} detail={money(reviewData.summary.unexplainedOperationalBookValueClp)+' preservados bajo el umbral material actual'} />
          </div>
          <details>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
              Ver primeras {number(Math.min(reviewData.unresolved.rows.length,reviewData.unresolved.limitedTo))} filas para revisión
            </summary>
            <div className="divide-y border-t">
              {reviewData.unresolved.rows.map((row)=>(
                <div key={row.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.5fr)_180px_150px_160px] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.description||'Sin descripción'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.source_sheet||'Sin hoja'} · fila {row.source_row??'—'}</p>
                  </div>
                  <Value label="Centro fuente" value={row.cost_center_raw||'Sin centro'} />
                  <Value label="Valor libro" value={money(row.net_book_value==null?null:Number(row.net_book_value))} />
                  <Badge variant="outline">{row.reason.label}</Badge>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </section>

    <section className="rounded-lg border px-4 py-3 text-xs leading-5 text-muted-foreground">
      <strong className="font-medium text-foreground">Regla actual:</strong> el valor asegurado se conserva en UF y no se compara todavía con valor libro. La cola de reemplazo se habilitará sólo cuando la depreciación de Daniel esté conciliada por activo.
    </section>
  </div>;
}

function Metric({icon:Icon,label,value,detail}:{icon:LucideIcon;label:string;value:string;detail:string}){
  return <div className="bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4"/>{label}</div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function Value({label,value,detail}:{label:string;value:string;detail?:string}){
  return <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium tabular-nums">{value}</p>{detail?<p className="mt-1 text-xs text-muted-foreground">{detail}</p>:null}</div>;
}


function ReviewMetric({label,value,detail}:{label:string;value:string;detail:string}){
  return <div className="bg-card p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
