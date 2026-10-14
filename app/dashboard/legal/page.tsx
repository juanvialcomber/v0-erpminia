'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, FileText, Scale, ShieldCheck, FolderCheck, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar Legal');
  return payload;
};

type CompliancePayload = {
  summary?: {
    contracts_pending_review: number;
    expiring_contracts: number;
    contracts_missing_file: number;
    expiring_documents: number;
  };
  contracts_pending_review?: Array<{ id: string; title: string }>;
  expiring_contracts?: Array<{ id: string; title: string; days_until_expiry?: number }>;
  contracts_missing_file?: Array<{ id: string; title: string }>;
  expiring_documents?: Array<{ id: string; title: string; expiry_date?: string }>;
};

type ContractorFolder = { id: string; empresa_nombre: string; status: string; submitted_at: string | null; carpeta_documentos?: Array<{ file_name: string | null; l1_status: string | null }> };
type ContractorPayload = { carpetas?: ContractorFolder[] };
type EeccCoverage = { summary: {registered:number;with_folder:number;without_folder:number} };

type CasesPayload = { data?: Array<{ id: string; title: string; status: string; evidence_status: string; action_required?: string | null }>; summary?: { total: number; new: number; in_review: number; action_required: number; waiting_area: number; closed: number } };

type RegulatoryPayload = {
  summary?: {
    critical: number;
    withMatchedEvidence: number;
    withoutMatchedEvidence: number;
  };
};

export default function LegalPage() {
  const { data: complianceData, error: complianceError, mutate: mutateCompliance } = useSWR<CompliancePayload>(
    '/api/legal/compliance',
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: casesData, error: casesError, mutate: mutateCases } = useSWR<CasesPayload>(
    '/api/legal/cases',
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: regulatoryData, error: regulatoryError, mutate: mutateRegulatory } = useSWR<RegulatoryPayload>(
    '/api/legal/sernageomin',
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: contractorData, error: contractorError, mutate: mutateContractors } = useSWR<ContractorPayload>('/api/carpeta-arranque', fetcher, { revalidateOnFocus: false });
  const {data: coverage, error: coverageError} = useSWR<EeccCoverage>('/api/legal/eecc-coverage', fetcher, {revalidateOnFocus:false});
  const l1Queue = (contractorData?.carpetas || []).filter(c => c.status === 'en_revision_l1');
  const secondReview = (contractorData?.carpetas || []).filter(c => c.status === 'en_revision_l2');
  const compliance = complianceData?.summary;
  const regulatory = regulatoryData?.summary;
  const attention = [
    ...(complianceData?.contracts_pending_review || []).slice(0, 3).map((item) => ({
      id: `review-${item.id}`,
      title: item.title,
      detail: 'Contrato requiere revisión Legal',
      href: '/dashboard/documentos-gestion/contratos',
    })),
    ...(complianceData?.expiring_contracts || []).slice(0, 3).map((item) => ({
      id: `expiry-${item.id}`,
      title: item.title,
      detail: typeof item.days_until_expiry === 'number' ? `Vence en ${item.days_until_expiry} días` : 'Vencimiento próximo',
      href: '/dashboard/documentos-gestion/contratos',
    })),
    ...(complianceData?.expiring_documents || []).slice(0, 3).map((item) => ({
      id: `document-${item.id}`,
      title: item.title,
      detail: item.expiry_date ? `Documento vence ${item.expiry_date}` : 'Documento por vencer',
      href: '/dashboard/legal/documentos',
    })),
  ].slice(0, 5);

  const openCases = casesData?.summary ? casesData.summary.total - casesData.summary.closed : undefined;
  const closureCases = casesError ? [] : (casesData?.data || []).filter((item) => item.status !== 'closed' && /cierre|sernageomin|garant[ií]a|relave|resoluci[oó]n/i.test(item.title));
  const hasError = complianceError || regulatoryError || casesError;

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Legal</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Casos, vencimientos y evidencia que requieren seguimiento legal.
        </p>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4" aria-label="Compliance 360">
        <div><h2 className="font-semibold">Compliance 360 · SERNAGEOMIN</h2><p className="mt-1 text-sm text-muted-foreground">Obligaciones, evidencias candidatas y acciones que requieren validación de Legal.</p></div>
        <Button asChild size="sm"><Link href="/dashboard/legal/compliance-360">Abrir matriz <ArrowRight className="ml-2 size-4"/></Link></Button>
      </section>
      <section aria-labelledby="legal-work-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">01 / Acciones</p><h2 id="legal-work-title" className="mt-1 text-lg font-semibold">Qué debes resolver</h2><p className="text-sm text-muted-foreground">Empieza por las carpetas que esperan una decisión de Legal.</p></div>
          <Button asChild size="sm"><Link href="/dashboard/legal/contratistas-documentos">Abrir bandeja <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        <div className="overflow-hidden rounded-md border">
          <div className="flex flex-wrap gap-4 border-b px-4 py-3 text-sm text-muted-foreground" role="status">
            {coverageError ? 'Cobertura de EECC no disponible' : coverage ? <><span><strong className="text-foreground">{coverage.summary.registered}</strong> contratistas registradas</span><span><strong className="text-foreground">{coverage.summary.with_folder}</strong> con carpeta</span><span><strong className="text-foreground">{coverage.summary.without_folder}</strong> aún sin carpeta</span></> : 'Consultando cobertura de contratistas…'}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium"><FolderCheck className="h-4 w-4" />Contratistas · Primera revisión</span>
            <span className="text-sm tabular-nums text-muted-foreground">{contractorError ? 'No disponible' : contractorData ? `${l1Queue.length} pendientes` : 'Cargando…'}</span>
          </div>
          {contractorError ? <p className="p-4 text-sm text-destructive">No se pudo cargar la bandeja. <button className="underline" onClick={() => void mutateContractors()}>Reintentar</button></p>
            : !contractorData ? <p className="p-4 text-sm text-muted-foreground">Consultando carpetas…</p>
            : l1Queue.length ? <div className="divide-y">{l1Queue.slice(0, 5).map(c => <Link key={c.id} href="/dashboard/legal/contratistas-documentos" className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/30"><span className="min-w-0 truncate font-medium">{c.empresa_nombre}</span><span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{(c.carpeta_documentos || []).filter(d => d.file_name).length} archivos <ArrowRight className="h-4 w-4" /></span></Link>)}</div>
            : <p className="p-4 text-sm text-muted-foreground">No hay carpetas en primera revisión.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Segunda firma, solo si Legal la solicita</span>
            <span className="tabular-nums">{contractorError ? '—' : contractorData ? secondReview.length : '…'}</span>
          </div>
        </div>
      </section>

      {hasError ? (
        <StatePanel
          tone="error"
          title="Parte del control Legal no pudo actualizarse"
          description="Los datos faltantes no se sustituyen por cero ni por estados inferidos."
          actions={<Button variant="outline" size="sm" onClick={() => { void mutateCompliance(); void mutateRegulatory(); void mutateCases(); }}>Reintentar</Button>}
          className="min-h-0"
        />
      ) : null}

      <section aria-labelledby="closure-evidence-title" className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="closure-evidence-title" className="text-base font-semibold">Evidencia regulatoria por conciliar</h2><p className="mt-1 text-sm text-muted-foreground">Casos canónicos abiertos asociados por título a cierre minero o SERNAGEOMIN. La coincidencia no acredita aplicabilidad ni cumplimiento.</p></div><Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/casos">Revisar expedientes <ArrowRight className="h-4 w-4" /></Link></Button></div>
        {casesError ? <p className="text-sm text-destructive">No se pudo consultar la cola de expedientes.</p> : !casesData ? <p className="text-sm text-muted-foreground">Cargando expedientes...</p> : closureCases.length === 0 ? <p className="text-sm text-muted-foreground">Sin casos abiertos identificados por este filtro. Esto no acredita ausencia de obligaciones.</p> : <div className="divide-y rounded-md border">{closureCases.slice(0, 8).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">Caso {item.status} · Evidencia {item.evidence_status || 'sin evaluar'} · Requiere revisión humana</p>{item.action_required ? <p className="mt-1 text-xs text-muted-foreground">{item.action_required}</p> : null}</div><Link className="text-sm font-medium text-primary hover:underline" href="/dashboard/legal/casos">Revisar caso</Link></div>)}</div>}
        <div className="flex flex-wrap gap-4 text-xs"><Link href="/dashboard/centros-costos" className="text-primary hover:underline">Consultar centros de costo</Link><Link href="/dashboard/finanzas" className="text-primary hover:underline">Ver control financiero</Link></div>
        <p className="text-xs text-muted-foreground">Sin resolución ni garantía acreditada no se calcula valorización de cierre, suficiencia de garantías ni estado de cumplimiento.</p>
      </section>

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-5">
        {[
          ['Casos abiertos', openCases ?? '—'],
          ['Contratos por revisar', compliance?.contracts_pending_review ?? '—'],
          ['Contratos por vencer', compliance?.expiring_contracts ?? '—'],
          ['Documentos por vencer', compliance?.expiring_documents ?? '—'],
          ['Señales regulatorias', regulatory?.withMatchedEvidence ?? '—'],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-2">
          <h2 className="text-base font-semibold">Qué requiere atención</h2>
          <p className="text-sm text-muted-foreground">Contratos y documentos que requieren acción.</p>
        </div>
        <div className="divide-y overflow-hidden rounded-md border">
          {attention.length ? attention.map((item) => (
            <Link key={item.id} href={item.href} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          )) : (
            <p className="px-4 py-4 text-sm text-muted-foreground">No hay señales operacionales pendientes en las fuentes disponibles.</p>
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Link href="/dashboard/legal/casos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Casos</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Trabajo legal trazable.</p>
        </Link>
        <Link href="/dashboard/legal/sernageomin" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Control regulatorio</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Obligaciones, plazos y evidencia.</p>
        </Link>
        <Link href="/dashboard/documentos-gestion/contratos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Contratos</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Vigencia, revisión y respaldo.</p>
        </Link>
        <Link href="/dashboard/legal/hse-intake" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Diagnóstico HSE</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Comprobar acceso y lectura de originales privados.</p>
        </Link>
        <Link href="/dashboard/legal/documentos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Documentos</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Expedientes, versiones y evidencia.</p>
        </Link>
      </section>

      <section className="rounded-md border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Flujo Legal</p>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-5">
          <p><span className="font-medium text-foreground">1. Señal</span><br />Un módulo detecta un hecho.</p>
          <p><span className="font-medium text-foreground">2. Evaluación</span><br />Legal determina impacto y riesgo.</p>
          <p><span className="font-medium text-foreground">3. Acción</span><br />Se define dueño y plazo.</p>
          <p><span className="font-medium text-foreground">4. Evidencia</span><br />El área ejecuta y respalda.</p>
          <p><span className="font-medium text-foreground">5. Cierre</span><br />Legal revisa y deja trazabilidad.</p>
        </div>
      </section>
    </div>
  );
}
