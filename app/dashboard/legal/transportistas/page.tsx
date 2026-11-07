'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Fuel, ReceiptText, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type ComponentRow={component_type:string;component_key:string;quantity:number|null;unit:string|null;unit_rate_clp:number|null;amount_clp:number|null;source_cell:string|null};
type Settlement={id:string;carrier_name:string;carrier_rut:string;gross_payable_clp:number;loans_clp:number|null;advance_clp:number|null;net_payable_clp:number;fuel_liters:number|null;source_row:number;components:ComponentRow[]};
type Payload={data:Settlement[];period:{start:string;end:string;source_sheet:string}|null;summary:{carriers:number;gross_payable_clp:number;loans_clp:number;advances_clp:number;net_payable_clp:number;fuel_liters:number}|null;policy:{rule:string;payment:string}};

const fetcher=async(url:string)=>{const r=await fetch(url,{credentials:'include',cache:'no-store'});const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(p?.error||'No se pudieron cargar liquidaciones');return p as Payload};
const money=(v:number|null|undefined)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(v||0));
const number=(v:number|null|undefined)=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:2}).format(Number(v||0));

export default function TransportSettlementsPage(){
 const {data,error,isLoading}=useSWR<Payload>('/api/legal/transport-settlements',fetcher,{revalidateOnFocus:false});
 if(isLoading)return <StatePanel tone="loading" title="Cargando liquidaciones" description="Leyendo la capa canónica deduplicada de transportistas."/>;
 if(error||!data)return <StatePanel tone="error" title="Liquidaciones no disponibles" description="MOTIL no calcula pagos si no puede verificar la fuente."/>;
 return <div className="space-y-5">
  <Button asChild size="sm" variant="ghost"><Link href="/dashboard/legal"><ArrowLeft className="mr-2 h-4 w-4"/>Legal</Link></Button>
  <header className="border-b border-border/70 pb-4">
   <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Transportistas</p>
   <h1 className="mt-1 text-2xl font-semibold">Liquidaciones</h1>
   <p className="mt-1 text-sm text-muted-foreground">Tonelaje, descuentos, anticipos y líquido a pago desde la planilla canónica de Elías. Liquidación no equivale a transferencia ejecutada.</p>
  </header>
  {data.period&&data.summary?<>
   <section className="rounded-md border p-4">
    <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Período</p>
    <p className="mt-1 text-lg font-semibold">{data.period.start} → {data.period.end}</p>
    <p className="mt-1 text-xs text-muted-foreground">Fuente: {data.period.source_sheet}</p>
   </section>
   <section className="grid overflow-hidden rounded-md border sm:grid-cols-5">
    {[
      ['Transportistas',data.summary.carriers],
      ['Bruto',money(data.summary.gross_payable_clp)],
      ['Anticipos',money(data.summary.advances_clp)],
      ['Líquido',money(data.summary.net_payable_clp)],
      ['Petróleo',number(data.summary.fuel_liters)+' L'],
    ].map(([label,value],i)=><div key={String(label)} className={`px-4 py-3 ${i?'border-t sm:border-l sm:border-t-0':''}`}><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}
   </section>
   <section className="divide-y overflow-hidden rounded-md border">
    {data.data.map(row=><article key={row.id} className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
       <div><div className="flex flex-wrap items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground"/><h2 className="text-sm font-semibold">{row.carrier_name}</h2><Badge variant="outline">{row.carrier_rut}</Badge></div>
       <p className="mt-2 text-xs text-muted-foreground">Fila fuente {row.source_row}</p></div>
       <div className="text-sm md:text-right"><p className="font-semibold">{money(row.net_payable_clp)}</p><p className="text-xs text-muted-foreground">Líquido a pago</p></div>
      </div>
      <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground md:grid-cols-4">
       <p><span className="font-medium text-foreground">Bruto</span><br/>{money(row.gross_payable_clp)}</p>
       <p><span className="font-medium text-foreground">Préstamos</span><br/>{money(row.loans_clp)}</p>
       <p><span className="font-medium text-foreground">Anticipo</span><br/>{money(row.advance_clp)}</p>
       <p><span className="font-medium text-foreground">Petróleo</span><br/>{number(row.fuel_liters)} L</p>
      </div>
      {row.components.length?<details className="mt-3"><summary className="cursor-pointer text-xs font-medium">Ver componentes</summary><div className="mt-2 grid gap-2 md:grid-cols-2">{row.components.map((c,i)=><div key={c.component_type+c.component_key+i} className="rounded-md bg-muted/30 px-3 py-2 text-xs"><p className="font-medium">{c.component_key}</p><p className="mt-1 text-muted-foreground">{c.quantity!=null?`${number(c.quantity)} ${c.unit||''}`:''}{c.amount_clp!=null?` · ${money(c.amount_clp)}`:''}</p></div>)}</div></details>:null}
    </article>)}
   </section>
  </>:<p className="rounded-md border p-4 text-sm text-muted-foreground">No hay liquidaciones canónicas disponibles.</p>}
  <section className="rounded-md border bg-muted/20 p-4"><ReceiptText className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">Regla de verdad</p><p className="mt-1 text-xs text-muted-foreground">{data.policy.rule}</p><p className="mt-1 text-xs text-muted-foreground">{data.policy.payment}</p></section>
 </div>
}
