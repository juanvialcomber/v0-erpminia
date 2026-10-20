'use client';

import useSWR from 'swr';
import { AlertTriangle, CalendarDays, Route, Scale, Truck, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';

type TransportData = {
  period: null | { start:string; through:string; movements:number; tons:number; avgTonsPerMovement:number; mines:number; sectors:number; carriers:number; vehicles:number; normalizedCoveragePct:number; validatedCoveragePct:number };
  daily: Array<{ date:string; rows:number; tons:number }>;
  routes: Array<{ mine:string; sector:string; rows:number; tons:number }>;
  carriers: Array<{ carrier:string; rows:number; tons:number; vehicles:number }>;
  vehicles: Array<{ plate:string; carrier:string; rows:number; tons:number }>;
  rows: Array<{ id:string; movement_number:string|null; movement_date:string; movement_time:string|null; mine_name_raw:string|null; sector_name_raw:string|null; carrier_name_raw:string|null; driver_name_raw:string|null; vehicle_plate_raw:string|null; normalized_metric_tons:number|null; validation_status:string|null }>;
  lineage: { table:string; note:string };
};

const fetcher = async (url:string):Promise<TransportData> => {
  const response = await fetch(url, { credentials:'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No fue posible cargar transporte de mineral');
  return data;
};

function date(value:string){ return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(`${value}T12:00:00`)); }
function tons(value:number,digits=1){ return `${value.toLocaleString('es-CL',{maximumFractionDigits:digits})} t`; }
function pct(value:number){ return `${value.toLocaleString('es-CL',{maximumFractionDigits:1})}%`; }

export function MineralTransportDashboard(){
  const { data,error,isLoading,mutate } = useSWR('/api/produccion/transporte-mineral',fetcher);
  const p = data?.period;
  const maxDaily = Math.max(...(data?.daily.map((d)=>d.tons) || [0]),1);

  return <div className="space-y-6">
    <PageHeader><PageHeaderContent><PageHeaderEyebrow>Producción · Transporte</PageHeaderEyebrow><PageHeaderTitle>Transporte de Mineral</PageHeaderTitle><PageHeaderDescription>{p ? `Movimiento mina → planta con datos hasta ${date(p.through)}.` : 'Trazabilidad operacional de movimientos mina → planta.'}</PageHeaderDescription></PageHeaderContent></PageHeader>

    <WhatsappOperationalUpdates mode="dispatch"/>

    {error ? <StatePanel tone="error" title="No fue posible cargar Transporte" description="Reintenta la consulta." actions={<Button variant="outline" onClick={()=>void mutate()}>Reintentar</Button>} className="min-h-0 py-5"/> : null}
    {!error && !isLoading && !p ? <StatePanel tone="neutral" title="Sin movimientos cargados" description="No existe información canónica de transporte para mostrar."/> : null}

    <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3" aria-label="Resumen de transporte">
      {[
        {label:'Transportado',value:p?tons(p.tons):'—',detail:p?`${p.movements} movimientos`:'',icon:Scale},
        {label:'Movimientos',value:p?p.movements.toLocaleString('es-CL'):'—',detail:p?`${p.vehicles} vehículos`:'',icon:Truck},
        {label:'Último corte',value:p?date(p.through):'—',detail:p?`Desde ${date(p.start)}`:'',icon:CalendarDays},
      ].map((metric)=>{ const Icon=metric.icon; return <div key={metric.label} className="bg-card px-5 py-4"><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{metric.label}</p><Icon className="h-4 w-4 text-muted-foreground"/></div><p className="mt-2 text-2xl font-semibold tracking-tight">{isLoading?'—':metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p></div>; })}
    </section>

    {p&&p.validatedCoveragePct<100?<div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/><div><p className="font-medium">Hay movimientos por revisar</p><p className="mt-1 text-muted-foreground">Cobertura validada: {pct(p.validatedCoveragePct)}.</p></div></div>:null}

    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver contexto de transporte</summary>
      <div className="grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">Promedio por movimiento</p><p className="mt-1 font-medium">{p?tons(p.avgTonsPerMovement,2):'—'}</p></div>
        <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">Transportistas</p><p className="mt-1 font-medium">{p?p.carriers.toLocaleString('es-CL'):'—'}</p></div>
        <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">Origen</p><p className="mt-1 font-medium">{p?`${p.mines} minas · ${p.sectors} sectores`:'—'}</p></div>
        <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">Cobertura</p><p className="mt-1 font-medium">{p?pct(p.normalizedCoveragePct):'—'}</p></div>
      </div>
    </details>

    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver detalle de transporte</summary>
      <div className="space-y-4 border-t p-4">
        {data?.daily?.length ? <section className="rounded-lg border bg-card p-4"><div className="mb-4"><p className="font-medium">Tendencia diaria</p><p className="text-sm text-muted-foreground">Toneladas transportadas por día del período vigente.</p></div><div className="space-y-2">{data.daily.map((d)=><div key={d.date} className="grid grid-cols-[92px_1fr_110px] items-center gap-3 text-sm"><span className="text-muted-foreground">{date(d.date).replace(/ de /g,' ')}</span><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${Math.max((d.tons/maxDaily)*100,2)}%`}}/></div><span className="text-right font-medium">{tons(d.tons)}</span></div>)}</div></section> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><p className="font-medium">Origen y sector</p><p className="text-sm text-muted-foreground">Principales rutas por toneladas.</p></div><div className="divide-y">{data?.routes?.slice(0,10).map((r)=><div key={`${r.mine}-${r.sector}`} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3"><div><p className="text-sm font-medium">{r.mine}</p><p className="text-xs text-muted-foreground">{r.sector} · {r.rows} movimientos</p></div><p className="text-sm font-medium">{tons(r.tons)}</p></div>)}</div></section>
          <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><p className="font-medium">Transportistas</p><p className="text-sm text-muted-foreground">Carga movilizada y vehículos asociados.</p></div><div className="divide-y">{data?.carriers?.slice(0,10).map((c)=><div key={c.carrier} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3"><div><p className="text-sm font-medium">{c.carrier}</p><p className="text-xs text-muted-foreground">{c.rows} movimientos · {c.vehicles} vehículos</p></div><p className="text-sm font-medium">{tons(c.tons)}</p></div>)}</div></section>
        </div>

        <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><p className="font-medium">Vehículos</p><p className="text-sm text-muted-foreground">Ranking por toneladas transportadas.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Patente</th><th className="px-4 py-2 font-medium">Transportista</th><th className="px-4 py-2 text-right font-medium">Movimientos</th><th className="px-4 py-2 text-right font-medium">Toneladas</th></tr></thead><tbody className="divide-y">{data?.vehicles?.map((v)=><tr key={v.plate}><td className="px-4 py-3 font-medium">{v.plate}</td><td className="px-4 py-3 text-muted-foreground">{v.carrier}</td><td className="px-4 py-3 text-right">{v.rows}</td><td className="px-4 py-3 text-right font-medium">{tons(v.tons)}</td></tr>)}</tbody></table></div></section>

        <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><p className="font-medium">Movimientos recientes</p><p className="text-sm text-muted-foreground">Detalle canónico del período actual.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Fecha</th><th className="px-4 py-2 font-medium">Mina / sector</th><th className="px-4 py-2 font-medium">Transportista</th><th className="px-4 py-2 font-medium">Patente</th><th className="px-4 py-2 font-medium">Chofer</th><th className="px-4 py-2 text-right font-medium">Toneladas</th></tr></thead><tbody className="divide-y">{data?.rows?.map((r)=><tr key={r.id}><td className="px-4 py-3">{date(r.movement_date)}</td><td className="px-4 py-3"><p className="font-medium">{r.mine_name_raw||'Sin identificar'}</p><p className="text-xs text-muted-foreground">{r.sector_name_raw||'Sin sector'}</p></td><td className="px-4 py-3 text-muted-foreground">{r.carrier_name_raw||'Sin identificar'}</td><td className="px-4 py-3">{r.vehicle_plate_raw||'—'}</td><td className="px-4 py-3 text-muted-foreground">{r.driver_name_raw||'—'}</td><td className="px-4 py-3 text-right font-medium">{r.normalized_metric_tons==null?'—':tons(Number(r.normalized_metric_tons),2)}</td></tr>)}</tbody></table></div></section>


      </div>
    </details>

    {data?.lineage ? <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"/><p className="text-muted-foreground">{data.lineage.note}</p></div> : null}
  </div>;
}
