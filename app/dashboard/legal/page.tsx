'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BellRing, CheckCircle2, CircleDollarSign, FolderCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar Legal');
  return payload;
};

type EeccCoverage = { period:string; summary:{registered:number;with_folder:number;without_folder:number;in_review:number;approved:number} };
type InboxItem = {
  id:string; area:string; title:string; detail:string|null; due_date:string|null; days_until:number|null;
  overdue:boolean; timing_state:'overdue'|'due_soon'|'on_track'|'no_due_date'; priority:'critical'|'high'|'medium'|'low';
  owner:string|null; evidence_status:string; management_ready?:boolean; source_href:string; next_action:string;
};
type InboxPayload = { data?:InboxItem[]; summary?:{total:number;overdue:number;due_next_7_days:number;waiting_signatures:number;evidence_pending:number;ready_for_management:number}; warnings?:string[] };
type ContractControlPayload = { summary:{contracts:number;contracts_red:number;contracts_yellow:number;contracts_green:number} };
type LegalNotification = { id:string;title:string;message:string;read_at:string|null;created_at:string };
type LegalNotificationsPayload = { notifications:LegalNotification[];summary:{total:number;unread:number} };

export default function LegalPage() {
  const { data: inboxData, error: inboxError, mutate: mutateInbox } = useSWR<InboxPayload>('/api/legal/inbox', fetcher, { revalidateOnFocus:false });
  const { data: coverage, error: coverageError } = useSWR<EeccCoverage>('/api/legal/eecc-coverage', fetcher, { revalidateOnFocus:false });
  const { data: legalNotifications } = useSWR<LegalNotificationsPayload>('/api/legal/notifications', fetcher, { revalidateOnFocus:false });
  const { data: contractControl, error: contractControlError } = useSWR<ContractControlPayload>('/api/legal/contract-payment-control', fetcher, { revalidateOnFocus:false });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Elías</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hoy</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Qué requiere acción ahora, sin revisar planillas ni módulos uno por uno.
          </p>
        </div>
        <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/inbox">Ver todos los pendientes <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      </header>

      <section aria-labelledby="now-title" className="overflow-hidden rounded-md border">
        <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prioridad</p>
            <h2 id="now-title" className="mt-1 text-base font-semibold">Ahora</h2>
            <p className="mt-1 text-sm text-muted-foreground">Máximo tres asuntos, ordenados por urgencia y siguiente acción.</p>
          </div>
          {inboxData?.summary ? <span className="text-xs text-muted-foreground">{inboxData.summary.total} abiertos</span> : null}
        </div>

        {inboxError ? (
          <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm">
            <span className="text-destructive">No se pudo actualizar el trabajo pendiente.</span>
            <button className="font-medium underline" onClick={() => void mutateInbox()}>Reintentar</button>
          </div>
        ) : !inboxData?.data ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Ordenando prioridades…</p>
        ) : inboxData.data.length ? (
          <div className="divide-y">
            {inboxData.data.slice(0,3).map((item,index)=>(
              <article key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[32px_minmax(0,1fr)_auto] md:items-start">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold">{index+1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{item.area}</span>
                    {item.overdue ? <span className="text-xs font-medium text-destructive">Vencido</span> : null}
                    {!item.overdue && item.days_until !== null && item.days_until <= 7 ? <span className="text-xs font-medium">Próximo</span> : null}
                    {item.management_ready ? <span className="text-xs font-medium">Listo para Gerencia</span> : null}
                  </div>
                  <h3 className="mt-1 text-sm font-semibold">{item.title}</h3>
                  {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
                  <p className="mt-2 text-sm"><span className="font-medium">Siguiente acción:</span> {item.next_action}</p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={item.source_href}>Abrir <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            No hay asuntos abiertos en las fuentes disponibles.
          </div>
        )}
        {inboxData?.warnings?.length ? <p className="border-t px-4 py-2 text-xs text-muted-foreground">{inboxData.warnings.join(' ')}</p> : null}
      </section>

      <section className="grid gap-3 lg:grid-cols-3" aria-label="Excepciones operativas">
        <Link href="/dashboard/legal/avances-pagos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Contratos</span>
          </div>
          <p className="mt-3 text-sm font-semibold">
            {contractControlError ? 'Revisión no disponible' : contractControl ? `${contractControl.summary.contracts_red + contractControl.summary.contracts_yellow} requieren atención` : 'Revisando contratos…'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {contractControl ? `${contractControl.summary.contracts_red} vencidos/rojos · ${contractControl.summary.contracts_yellow} a ≤15 días` : 'Avance, fechas, facturación, retención y pago.'}
          </p>
        </Link>

        <Link href="/dashboard/legal/contratistas-documentos" className="rounded-md border p-4 transition-colors hover:bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <FolderCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Proveedores</span>
          </div>
          <p className="mt-3 text-sm font-semibold">
            {coverageError ? 'Cumplimiento no disponible' : coverage ? `${coverage.summary.without_folder + coverage.summary.in_review} requieren atención` : 'Revisando cumplimiento…'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {coverage ? `${coverage.summary.without_folder} sin carpeta · ${coverage.summary.in_review} en revisión` : 'Cumplimiento del período actual.'}
          </p>
        </Link>

        <section className="rounded-md border p-4">
          <div className="flex items-center justify-between gap-3">
            <BellRing className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Pagos</span>
          </div>
          <p className="mt-3 text-sm font-semibold">
            {legalNotifications ? `${legalNotifications.summary.unread} confirmaciones nuevas` : 'Revisando pagos…'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Transferencias registradas por Finanzas que requieren visibilidad de Legal.
          </p>
          {legalNotifications?.notifications?.[0] ? (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{legalNotifications.notifications[0].message}</p>
          ) : null}
        </section>
      </section>

      <details className="rounded-md border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Herramientas y áreas de soporte
        </summary>
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['/dashboard/legal/pagos-facturas','Respaldo financiero'],
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
