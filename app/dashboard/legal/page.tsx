'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CircleDollarSign, FolderCheck, Scale, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar Legal');
  return payload;
};

type ContractorFolder = { id:string; empresa_nombre:string; status:string; carpeta_documentos?:Array<{file_name:string|null}> };
type ContractorPayload = { carpetas?: ContractorFolder[] };
type EeccCoverage = { summary:{registered:number;with_folder:number;without_folder:number} };
type InboxPayload = { summary?:{total:number;overdue:number;due_next_7_days:number;waiting_signatures:number;evidence_pending:number;ready_for_management:number}; warnings?:string[] };

export default function LegalPage() {
  const { data: inboxData, error: inboxError, mutate: mutateInbox } = useSWR<InboxPayload>('/api/legal/inbox', fetcher, { revalidateOnFocus:false });
  const { data: contractorData, error: contractorError } = useSWR<ContractorPayload>('/api/carpeta-arranque', fetcher, { revalidateOnFocus:false });
  const { data: coverage, error: coverageError } = useSWR<EeccCoverage>('/api/legal/eecc-coverage', fetcher, { revalidateOnFocus:false });

  const l1Queue = (contractorData?.carpetas || []).filter(c => c.status === 'en_revision_l1');

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Elías</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Qué necesita atención</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Avances, pagos, proveedores y evidencia ordenados por la siguiente acción.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href="/dashboard/legal/inbox">Abrir Hoy <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/asistente">Preguntar al asistente</Link></Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4" aria-label="Trabajo principal de Legal">
        <Link href="/dashboard/legal/inbox" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Hoy</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Vencidos, próximos, firmas y evidencia pendiente.</p>
        </Link>
        <Link href="/dashboard/legal/avances-pagos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Contratos y pagos</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Avance, OC, factura, retención y pago verificado.</p>
        </Link>
        <Link href="/dashboard/legal/contratistas-documentos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <FolderCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Proveedores</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Cumplimiento mensual, documentos y subsanaciones.</p>
        </Link>
        <Link href="/dashboard/legal/asistente" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Asistente</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Conclusión, siguiente acción y evidencia.</p>
        </Link>
      </section>

      <section aria-labelledby="today-title" className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prioridad</p>
            <h2 id="today-title" className="mt-1 text-base font-semibold">Hoy</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lo que requiere una decisión, respuesta o evidencia.</p>
          </div>
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/inbox">Ver acciones <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        {inboxError ? (
          <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
            <span className="text-destructive">No se pudo actualizar la bandeja.</span>
            <button className="font-medium underline" onClick={() => void mutateInbox()}>Reintentar</button>
          </div>
        ) : !inboxData?.summary ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Consolidando trabajo pendiente…</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-4">
              {[
                ['Pendientes', inboxData.summary.total],
                ['Vencidos', inboxData.summary.overdue],
                ['Próx. 7 días', inboxData.summary.due_next_7_days],
                ['Listos Gerencia', inboxData.summary.ready_for_management],
              ].map(([label, value], index) => (
                <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            {inboxData.warnings?.length ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">{inboxData.warnings.join(' ')}</p> : null}
          </>
        )}
      </section>

      <section aria-labelledby="providers-title" className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Proveedores</p>
            <h2 id="providers-title" className="mt-1 text-base font-semibold">Cumplimiento mensual</h2>
            <p className="mt-1 text-sm text-muted-foreground">Revisar sólo proveedores que requieren acción de Legal.</p>
          </div>
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/contratistas-documentos">Abrir proveedores <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        <div className="grid sm:grid-cols-4">
          <div className="px-4 py-3"><p className="text-[11px] uppercase text-muted-foreground">Registrados</p><p className="mt-1 text-xl font-semibold">{coverageError ? '—' : coverage?.summary.registered ?? '…'}</p></div>
          <div className="border-t px-4 py-3 sm:border-l sm:border-t-0"><p className="text-[11px] uppercase text-muted-foreground">Con carpeta</p><p className="mt-1 text-xl font-semibold">{coverageError ? '—' : coverage?.summary.with_folder ?? '…'}</p></div>
          <div className="border-t px-4 py-3 sm:border-l sm:border-t-0"><p className="text-[11px] uppercase text-muted-foreground">Sin carpeta</p><p className="mt-1 text-xl font-semibold">{coverageError ? '—' : coverage?.summary.without_folder ?? '…'}</p></div>
          <div className="border-t px-4 py-3 sm:border-l sm:border-t-0"><p className="text-[11px] uppercase text-muted-foreground">Primera revisión</p><p className="mt-1 text-xl font-semibold">{contractorError ? '—' : contractorData ? l1Queue.length : '…'}</p></div>
        </div>
      </section>

      <details className="rounded-md border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Herramientas y áreas de soporte
        </summary>
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['/dashboard/legal/laudus','Evidencia financiera'],
            ['/dashboard/legal/control-contractual','Control contractual'],
            ['/dashboard/legal/documentos','Archivo Legal'],
            ['/dashboard/legal/casos','Casos'],
            ['/dashboard/legal/compliance-360','Cumplimiento'],
            ['/dashboard/legal/sernageomin','Obligaciones'],
            ['/dashboard/legal/propiedad-minera','Propiedad minera'],
            ['/dashboard/legal/permisos-licencias','Permisos'],
          ].map(([href,label]) => <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{label}</Link>)}
        </div>
      </details>

      <StatePanel
        tone="neutral"
        title="Regla de trabajo"
        description="MOTIL prioriza qué requiere atención y la siguiente acción. El detalle técnico y regulatorio queda disponible sólo cuando Elías lo necesita."
        className="min-h-0"
      />
    </div>
  );
}
