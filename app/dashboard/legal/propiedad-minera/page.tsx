'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Royalty = {
  id:string;
  lot_ref:string|null;
  event_date:string|null;
  tonnes:number|null;
  cu_grade_pct:number|null;
  net_clp:number|null;
  royalty_clp:number|null;
  payment_status:string;
  payment_note:string|null;
  destination:string|null;
};

type PropertyItem = {
  id:string;
  representative_name:string;
  property_name:string;
  patent_value_clp:number|null;
  royalty_count:number;
  royalty_total_clp:number;
  tonnes_total:number;
  paid_events:number;
  pending_events:number;
  latest_event_date:string|null;
  royalties:Royalty[];
};

type Payload = {
  data:PropertyItem[];
  summary:{
    properties:number;
    royalties:number;
    royalty_total_clp:number;
    tonnes_total:number;
    paid_events:number;
    pending_events:number;
    latest_event_date:string|null;
  };
  lineage:{note:string};
};

const fetcher=async(url:string):Promise<Payload>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar propiedad minera');
  return payload;
};

function clp(value:number|null|undefined){
  if(value===null||value===undefined) return '—';
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
}

function number(value:number|null|undefined,digits=1){
  if(value===null||value===undefined) return '—';
  return value.toLocaleString('es-CL',{maximumFractionDigits:digits});
}

export default function MiningPropertyPage(){
  const {data,error,isLoading}=useSWR<Payload>('/api/legal/mining-property',fetcher,{revalidateOnFocus:false});

  if(isLoading) return <StatePanel tone="loading" title="Cargando propiedad minera" description="Leyendo propiedades y regalías desde la fuente canónica."/>;
  if(error||!data) return <StatePanel tone="error" title="Propiedad minera no disponible" description="No se reemplazan datos faltantes por supuestos."/>;

  return <div className="space-y-5">
    <header className="border-b border-border/70 pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Propiedad minera</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Propiedad minera</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Propiedades, regalías, toneladas y estado de pago según la planilla canónica.</p>
    </header>

    <section className="grid overflow-hidden rounded-md border sm:grid-cols-6">
      {[
        ['Propiedades',data.summary.properties],
        ['Regalías',data.summary.royalties],
        ['Monto regalías',clp(data.summary.royalty_total_clp)],
        ['Toneladas',number(data.summary.tonnes_total,1)],
        ['Eventos pagados',data.summary.paid_events],
        ['Pendientes',data.summary.pending_events],
      ].map(([label,value],index)=><div key={String(label)} className={'px-4 py-3 '+(index?'border-t sm:border-l sm:border-t-0':'')}>
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </div>)}
    </section>

    <section className="divide-y overflow-hidden rounded-md border">
      {data.data.length?data.data.map((item)=><article key={item.id} className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{item.royalty_count} eventos</Badge>
              {item.pending_events>0?<Badge variant="secondary">{item.pending_events} pendientes</Badge>:<Badge variant="outline">Sin pendientes reportados</Badge>}
            </div>
            <h2 className="mt-2 text-sm font-semibold">{item.property_name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Representante: {item.representative_name}</p>
          </div>
          <div className="shrink-0 text-xs text-muted-foreground md:text-right">
            <p>Patente: {clp(item.patent_value_clp)}</p>
            <p className="mt-1">{item.latest_event_date?'Último evento: '+item.latest_event_date:'Sin fecha de evento'}</p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground md:grid-cols-4">
          <p><span className="font-medium text-foreground">Regalías</span><br/>{clp(item.royalty_total_clp)}</p>
          <p><span className="font-medium text-foreground">Toneladas</span><br/>{number(item.tonnes_total,1)} t</p>
          <p><span className="font-medium text-foreground">Pagadas</span><br/>{item.paid_events}</p>
          <p><span className="font-medium text-foreground">Pendientes</span><br/>{item.pending_events}</p>
        </div>

        {item.royalties.length?<details className="mt-3 rounded-md border bg-muted/10">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Ver últimos eventos</summary>
          <div className="divide-y border-t">
            {item.royalties.map((row)=><div key={row.id} className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[100px_1fr_110px_120px]">
              <span className="text-muted-foreground">{row.event_date||'Sin fecha'}</span>
              <span>{row.lot_ref||row.destination||'Sin referencia'}</span>
              <span className="text-right">{row.tonnes===null?'—':number(row.tonnes,1)+' t'}</span>
              <span className="text-right font-medium">{clp(row.royalty_clp)}</span>
            </div>)}
          </div>
        </details>:null}
      </article>):<p className="p-4 text-sm text-muted-foreground">No hay propiedades mineras promovidas desde la fuente canónica.</p>}
    </section>

    <section className="rounded-md border bg-muted/20 p-4">
      <p className="text-sm font-semibold">Fuente</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.lineage.note}</p>
    </section>
  </div>;
}