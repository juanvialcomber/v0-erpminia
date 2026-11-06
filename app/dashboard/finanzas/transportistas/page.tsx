'use client';

import useSWR from 'swr';
import { StatePanel } from '@/components/ui/state-panel';
import { Badge } from '@/components/ui/badge';

type Carrier = { carrier_name:string; carrier_rut:string|null; supplier_id:string|null; settlements:number; gross:number; net:number; loans:number; advance:number; fuel_liters:number; first_period:string|null; last_period:string|null };
type Month = { period:string; settlements:number; net:number; fuel_liters:number };
type Row = { id:string; carrier_name:string; carrier_rut:string|null; supplier_id:string|null; period_start:string|null; period_end:string|null; settlement_type:string; net_payable_clp:number|null; fuel_liters:number|null; source_sheet:string; source_row:number };
type Payload = {
  data:Row[];
  carriers:Carrier[];
  months:Month[];
  summary:{ settlements:number; canonical_carriers:number; net_total_clp:number; gross_total_clp:number; fuel_liters:number; resolved_supplier_rows:number; explicit_rut_unresolved:number; no_rut_rows:number; first_period:string|null; last_period:string|null };
  lineage:{ note:string };
};

const fetcher = async (url:string):Promise<Payload> => {
  const response = await fetch(url,{credentials:'include',cache:'no-store'});
  const payload = await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar liquidaciones');
  return payload;
};

const clp = (value:number) => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value||0);
const num = (value:number,digits=1) => Number(value||0).toLocaleString('es-CL',{maximumFractionDigits:digits});

export default function TransportSettlementsPage(){
  const {data,error,isLoading}=useSWR<Payload>('/api/finance/transport-settlements',fetcher,{revalidateOnFocus:false});
  if(isLoading) return <StatePanel tone="loading" title="Cargando transportistas" description="Leyendo liquidaciones promovidas y excluyendo duplicados legacy."/>;
  if(error||!data) return <StatePanel tone="error" title="Liquidaciones no disponibles" description="No se reemplazan montos faltantes por estimaciones."/>;

  return <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
    <header className="border-b pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Finanzas · Transportistas</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Liquidaciones de transportistas</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Histórico canónico de liquidaciones, combustible y resolución de proveedor.</p>
    </header>

    <section className="grid overflow-hidden rounded-lg border sm:grid-cols-3 xl:grid-cols-6">
      {[
        ['Liquidaciones',data.summary.settlements],
        ['Transportistas',data.summary.canonical_carriers],
        ['Neto liquidado',clp(data.summary.net_total_clp)],
        ['Combustible',num(data.summary.fuel_liters,1)+' L'],
        ['Con proveedor',data.summary.resolved_supplier_rows],
        ['Sin RUT',data.summary.no_rut_rows],
      ].map(([label,value],index)=><div key={String(label)} className={'px-4 py-3 '+(index?'border-t sm:border-l sm:border-t-0':'')}>
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </div>)}
    </section>

    {data.summary.explicit_rut_unresolved>0?<div className="rounded-md border px-4 py-3 text-sm"><span className="font-medium">{data.summary.explicit_rut_unresolved} liquidaciones con RUT explícito siguen sin proveedor canónico.</span><span className="ml-1 text-muted-foreground">Se mantienen como excepción; no se resuelven por nombre.</span></div>:null}

    <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Concentración por transportista</h2><p className="mt-1 text-xs text-muted-foreground">Agrupación por RUT/proveedor cuando existe; nombre fuente en caso contrario.</p></div>
        <div className="divide-y">{data.carriers.slice(0,20).map((carrier)=><div key={carrier.carrier_rut||carrier.supplier_id||carrier.carrier_name} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium">{carrier.carrier_name}</p><p className="mt-0.5 text-xs text-muted-foreground">{carrier.carrier_rut||'Sin RUT'} · {carrier.settlements} liquidaciones · {num(carrier.fuel_liters,1)} L</p></div>
          <div className="text-right"><p className="text-sm font-medium">{clp(carrier.net)}</p>{carrier.supplier_id?<Badge variant="outline" className="mt-1">Proveedor resuelto</Badge>:<Badge variant="secondary" className="mt-1">Identidad pendiente</Badge>}</div>
        </div>)}</div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Serie mensual</h2><p className="mt-1 text-xs text-muted-foreground">{data.summary.first_period||'—'} a {data.summary.last_period||'—'}</p></div>
        <div className="divide-y">{data.months.slice(0,18).map((month)=><div key={month.period} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 px-4 py-3 text-xs"><span className="font-medium">{month.period}</span><span className="text-muted-foreground">{month.settlements} liquidaciones · {num(month.fuel_liters,1)} L</span><span className="font-medium">{clp(month.net)}</span></div>)}</div>
      </div>
    </section>

    <details className="rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver liquidaciones recientes</summary>
      <div className="overflow-x-auto border-t"><table className="w-full min-w-[880px] text-sm"><thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2">Período</th><th className="px-4 py-2">Transportista</th><th className="px-4 py-2">RUT</th><th className="px-4 py-2 text-right">Neto</th><th className="px-4 py-2 text-right">Combustible</th><th className="px-4 py-2">Fuente</th></tr></thead><tbody className="divide-y">
        {data.data.map((row)=><tr key={row.id}><td className="px-4 py-3">{row.period_end||row.period_start||'—'}</td><td className="px-4 py-3 font-medium">{row.carrier_name}</td><td className="px-4 py-3 text-muted-foreground">{row.carrier_rut||'—'}</td><td className="px-4 py-3 text-right">{clp(Number(row.net_payable_clp||0))}</td><td className="px-4 py-3 text-right">{num(Number(row.fuel_liters||0),1)} L</td><td className="px-4 py-3 text-xs text-muted-foreground">{row.source_sheet} · fila {row.source_row}</td></tr>)}
      </tbody></table></div>
    </details>

    <section className="rounded-lg border bg-muted/20 p-4"><p className="text-sm font-semibold">Fuente canónica</p><p className="mt-1 text-xs text-muted-foreground">{data.lineage.note}</p></section>
  </div>;
}