'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type PropertyItem = {
  id: string;
  contract_number: string | null;
  title: string | null;
  contract_type: string | null;
  status: string | null;
  contract_value: number | null;
  currency: string | null;
  paid_amount: number | null;
  pending_amount: number;
  execution_percentage: number | null;
  responsible_area: string | null;
  responsible_person: string | null;
  end_date: string | null;
  review_due_date: string | null;
  contractor_name: string | null;
  property_name: string | null;
  project_name: string | null;
  royalty_rate: number | null;
  guarantee_amount: number | null;
  compliance_status: string | null;
  compliance_notes: string | null;
  has_evidence: boolean;
};

type PropertyControl = {
  id:string; link_status:string; source_property_name:string; national_role:string|null; tenant_name:string|null; contact_name:string|null;
  patent_value_clp_source:number|null; patent_payment_clp:number|null; patent_payment_status:string|null; patent_pending:boolean;
  effective_lease_end:string|null; lease_days_until:number|null; lease_overdue:boolean;
  sernageomin_expiry_date:string|null; sernageomin_expiry_raw:string|null; sernageomin_days_until:number|null; sernageomin_overdue:boolean; sernageomin_due_30:boolean;
  servitude_status:string|null; powder_magazine_status:string|null; royalty_count:number; royalty_paid_count:number; royalty_amount_clp:number;
  source_sheet:string;
};

type Response = {
  data: PropertyItem[];
  controls: PropertyControl[];
  controls_summary: { total:number; exact_links:number; conflicts:number; sernageomin_overdue:number; sernageomin_due_30:number; patent_pending:number; lease_overdue:number };
  summary: {
    total: number;
    with_property: number;
    with_royalty: number;
    review_due: number;
    missing_evidence: number;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar propiedad minera');
  return payload;
};

function money(value: number | null, currency: string | null) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency || 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MiningPropertyPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/legal/mining-property', fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <StatePanel tone="loading" title="Cargando propiedad minera" description="Leyendo contratos y obligaciones asociadas." />;
  }

  if (error || !data) {
    return <StatePanel tone="error" title="Propiedad minera no disponible" description="No se reemplazan datos faltantes por supuestos." />;
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Propiedad minera</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Propiedad minera</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Contratos, arriendos, regalías, revisiones y respaldo documental asociados a propiedad minera.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-5">
        {[
          ['Registros', data.summary.total],
          ['Con propiedad', data.summary.with_property],
          ['Con regalía', data.summary.with_royalty],
          ['Con revisión', data.summary.review_due],
          ['Sin evidencia', data.summary.missing_evidence],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-md border">
        <div className="border-b bg-muted/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Control Elías</p>
          <h2 className="mt-1 text-base font-semibold">Permisos, patentes y arriendos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Datos directos de la planilla de control. Los conflictos de identidad quedan visibles y no sobrescriben la propiedad canónica.</p>
        </div>
        <div className="grid sm:grid-cols-4">
          {[
            ['Propiedades fuente', data.controls_summary.total],
            ['SERNAGEOMIN vencidos', data.controls_summary.sernageomin_overdue],
            ['Patentes pendientes', data.controls_summary.patent_pending],
            ['Identidad a revisar', data.controls_summary.conflicts],
          ].map(([label,value],index)=><div key={String(label)} className={`px-4 py-3 ${index?'border-t sm:border-l sm:border-t-0':''}`}><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
        </div>
        <div className="divide-y border-t">
          {data.controls.map((item)=><article key={item.id} className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{item.source_property_name}</Badge>
                  {item.link_status!=='exact'?<Badge variant="destructive">Revisar identidad</Badge>:null}
                  {item.sernageomin_overdue?<Badge variant="destructive">SERNAGEOMIN vencido</Badge>:item.sernageomin_due_30?<Badge variant="secondary">SERNAGEOMIN ≤30 días</Badge>:null}
                  {item.patent_pending?<Badge variant="outline">Patente pendiente</Badge>:null}
                  {item.lease_overdue?<Badge variant="outline">Arriendo vencido</Badge>:null}
                </div>
                <p className="mt-2 text-sm font-medium">{item.tenant_name || 'Arrendatario no informado'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.national_role ? `Rol ${item.national_role} · ` : ''}{item.contact_name || 'Contacto no informado'}</p>
              </div>
              <div className="text-xs text-muted-foreground md:text-right">
                <p>{item.sernageomin_expiry_date ? `SERNAGEOMIN: ${item.sernageomin_expiry_date}` : item.sernageomin_expiry_raw ? `SERNAGEOMIN fuente: ${item.sernageomin_expiry_raw}` : 'SERNAGEOMIN sin fecha'}</p>
                <p className="mt-1">{item.effective_lease_end ? `Arriendo/anexo hasta: ${item.effective_lease_end}` : 'Sin término vigente informado'}</p>
                <p className="mt-1">Fuente: {item.source_sheet}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground md:grid-cols-4">
              <p><span className="font-medium text-foreground">Patente fuente</span><br/>{money(item.patent_value_clp_source,'CLP') || 'Sin monto'}</p>
              <p><span className="font-medium text-foreground">Pago patente</span><br/>{item.patent_payment_status || 'Sin estado'}{item.patent_payment_clp ? ` · ${money(item.patent_payment_clp,'CLP')}` : ''}</p>
              <p><span className="font-medium text-foreground">Regalías</span><br/>{item.royalty_paid_count}/{item.royalty_count} pagadas · {money(item.royalty_amount_clp,'CLP')}</p>
              <p><span className="font-medium text-foreground">Polvorín</span><br/>{item.powder_magazine_status || 'No informado'}</p>
            </div>
          </article>)}
        </div>
      </section>

      <section className="divide-y overflow-hidden rounded-md border">
        {data.data.length ? data.data.map((item) => (
          <article key={item.id} className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.contract_type || 'Contrato'}</Badge>
                  <Badge variant="outline">{item.status || 'Sin estado'}</Badge>
                  {item.royalty_rate && item.royalty_rate > 0 ? (
                    <Badge variant="secondary">Regalía {item.royalty_rate}%</Badge>
                  ) : null}
                  {!item.has_evidence ? <Badge variant="destructive">Sin respaldo</Badge> : null}
                </div>
                <h2 className="mt-2 text-sm font-semibold">{item.property_name || item.title || item.contract_number || 'Propiedad sin nombre'}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.contractor_name, item.project_name, item.responsible_area].filter(Boolean).join(' · ') || 'Sin contexto adicional registrado'}
                </p>
                {item.compliance_notes ? <p className="mt-2 text-sm">{item.compliance_notes}</p> : null}
              </div>

              <div className="shrink-0 text-xs text-muted-foreground md:text-right">
                <p>{item.review_due_date ? `Revisión: ${item.review_due_date}` : 'Sin fecha de revisión'}</p>
                <p className="mt-1">{item.end_date ? `Término: ${item.end_date}` : 'Sin fecha de término'}</p>
                <p className="mt-1">{item.responsible_person || 'Responsable no asignado'}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground md:grid-cols-4">
              <p><span className="font-medium text-foreground">Valor</span><br />{money(item.contract_value, item.currency) || 'Sin monto'}</p>
              <p><span className="font-medium text-foreground">Pagado</span><br />{money(item.paid_amount, item.currency) || 'Sin pago registrado'}</p>
              <p><span className="font-medium text-foreground">Pendiente</span><br />{money(item.pending_amount, item.currency) || 'Sin monto pendiente'}</p>
              <p><span className="font-medium text-foreground">Avance</span><br />{item.execution_percentage !== null ? `${item.execution_percentage}%` : 'Sin avance registrado'}</p>
            </div>
          </article>
        )) : (
          <p className="p-4 text-sm text-muted-foreground">
            No hay contratos con propiedad minera o regalías registrados en la fuente canónica.
          </p>
        )}
      </section>
    </div>
  );
}
