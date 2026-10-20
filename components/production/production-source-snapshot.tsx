'use client';

import useSWR from 'swr';

type Snapshot={
  stats:{cutoff:string|null;source:string|null;totalExtractedTons:number|null;forecastEndMonthTons?:number|null;fineExtractedTons?:number|null};
  stock:{cutoff:string|null;source:string|null;plantStockTons:number|null;totalMineralStockTons:number|null;transportedWeekTons?:number|null};
};
const fetcher=async(url:string):Promise<Snapshot>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.stats||!json?.stock)throw new Error(json?.error||'No fue posible leer el último corte canónico.');
  return json;
};
const tons=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('es-CL',{maximumFractionDigits:1})+' t';
const date=(value:string|null|undefined)=>{
  if(!value)return 'Sin corte';
  const [y,m,d]=value.split('-');
  return `${d}-${m}-${y}`;
};
export function ProductionSourceSnapshot(){
  const {data,error,isLoading}=useSWR<Snapshot>('/api/produccion/source-cutoff',fetcher,{
    refreshInterval:300000,revalidateOnFocus:true,revalidateOnReconnect:true,
  });
  const cutoff=[data?.stats.cutoff,data?.stock.cutoff].filter((v):v is string=>Boolean(v)).sort().at(-1)||null;
  if(error)return null;
  const cards=[
    {label:'Extracción a planta',value:tons(data?.stats.totalExtractedTons),detail:'Mes a la fecha'},
    {label:'Transporte informado',value:tons(data?.stock.transportedWeekTons),detail:'Semana del último corte'},
    {label:'Stock en planta',value:tons(data?.stock.plantStockTons),detail:'Saldo mineral informado'},
  ];
  return <section aria-label="Último corte canónico" className="overflow-hidden rounded-lg border bg-card">
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div><h2 className="text-sm font-medium">Último corte canónico</h2><p className="mt-1 text-xs text-muted-foreground">{isLoading?'Actualizando…':date(cutoff)}</p></div>
      <p className="text-xs text-muted-foreground">Excel operativo La Patagua</p>
    </div>
    <div className="grid gap-px bg-border sm:grid-cols-3">
      {cards.map(card=><div key={card.label} className="bg-card px-4 py-4">
        <p className="text-xs text-muted-foreground">{card.label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{isLoading?'—':card.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
      </div>)}
    </div>
  </section>;
}
