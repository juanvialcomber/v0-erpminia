'use client';

import useSWR from 'swr';
import {Button} from '@/components/ui/button';

type Daily={
  date:string;peumoTons:number|null;donJaimeTons:number|null;
  transportedTons:number|null;stockConsumptionDeltaTons:number|null;
  plantStockTons:number|null;
};
type Snapshot={
  stats:{cutoff:string|null;source:string|null;periodStart:string|null;
    peumoExtractedTons:number|null;donJaimeExtractedTons:number|null;
    totalExtractedTons:number|null;plannedToDateTons:number|null};
  stock:{cutoff:string|null;source:string|null;plantStockTons:number|null;
    totalMineralStockTons:number|null;daily:Daily[]};
  coverage:'partial_source_reported';note:string;
};
const fetcher=async(url:string):Promise<Snapshot>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.stats||!json?.stock)
    throw new Error(json?.error||'No se pudieron leer las fuentes recientes de producción.');
  return json;
};
const tons=(value:number|null,decimals=1)=>value===null?'—':
  value.toLocaleString('es-CL',{maximumFractionDigits:decimals})+' t';
const dmy=(input:string|null)=>{
  if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(input))return 'Sin corte confirmado';
  const [yyyy,mm,dd]=input.split('-');
  return dd+'-'+mm+'-'+yyyy;
};
export function PlantSourceCutoff(){
  const {data,error,isLoading,mutate}=useSWR<Snapshot>(
    '/api/produccion/source-cutoff',fetcher,{
      refreshInterval:300000,revalidateOnFocus:true,
    });
  const stats=data?.stats;
  const stock=data?.stock;
  const latestCutoff=[stats?.cutoff,stock?.cutoff].filter(
    (v):v is string=>typeof v==='string').sort().at(-1)||null;
  const cards=[
    {label:'Mineral extraído a planta · mes a la fecha',value:tons(stats?.totalExtractedTons??null),
      note:'Extracción de mina, no mineral tratado'},
    {label:'Extracción Mina Peumo',value:tons(stats?.peumoExtractedTons??null),
      note:'Reporte de extracción a planta'},
    {label:'Extracción Mina Don Jaime',value:tons(stats?.donJaimeExtractedTons??null),
      note:'Reporte de extracción a planta'},
    {label:'Plan de extracción a la fecha',value:tons(stats?.plannedToDateTons??null),
      note:'Plan teórico al corte, no meta de tratamiento'},
    {label:'Stock informado en planta',value:tons(stock?.plantStockTons??null),
      note:'Saldo de stock, no toneladas tratadas'},
  ];
  return <section aria-label="Extracción minera y stock más recientes" className="rounded-lg border bg-card">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
      <div className="space-y-1">
        <h2 className="font-semibold">Extracción y stock informados</h2>
        <p className="text-sm text-muted-foreground">
          Última actualización de corte: <strong className="font-medium text-foreground">
            {isLoading?'Consultando…':dmy(latestCutoff)}
          </strong>
        </p>
        <p className="max-w-3xl text-xs text-muted-foreground">
          Información parcial del Excel de extracción y stock. No sustituye turnos de planta,
          toneladas tratadas, análisis de ley ni recuperación metalúrgica.
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={isLoading}
        onClick={()=>void mutate()}>Actualizar fuentes</Button>
    </div>
    {error?<p role="alert" className="px-4 py-4 text-sm text-destructive">{error.message}</p>:null}
    {!error&&!isLoading&&!latestCutoff?<p className="px-4 py-4 text-sm text-muted-foreground">
      Aún no hay registros normalizados de extracción o stock recientes.
    </p>:null}
    {data&&latestCutoff?<div className="divide-y">
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(card=><div key={card.label} className="space-y-1 bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="text-xl font-semibold tabular-nums">{card.value}</p>
          <p className="text-xs text-muted-foreground">{card.note}</p>
        </div>)}
      </div>
      <div className="px-4 py-4">
        <div className="mb-3 space-y-1">
          <h3 className="text-sm font-medium">Movimientos diarios de stock informados</h3>
          <p className="text-xs text-muted-foreground">
            Fuente semanal: {stock?.source||'Sin planilla'} · corte {dmy(stock?.cutoff||null)}.
            La salida por consumo conserva el signo negativo de la planilla.
          </p>
        </div>
        {stock?.daily?.length?<div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Peumo extraído</th>
              <th className="px-3 py-2 font-medium">Don Jaime extraído</th>
              <th className="px-3 py-2 font-medium">Transporte informado</th>
              <th className="px-3 py-2 font-medium">Salida por consumo de stock</th>
              <th className="px-3 py-2 font-medium">Stock en planta</th>
            </tr></thead>
            <tbody>{stock.daily.map(row=><tr key={row.date} className="border-b last:border-0">
              <td className="px-3 py-3 font-medium">{dmy(row.date)}</td>
              <td className="px-3 py-3 tabular-nums">{tons(row.peumoTons,2)}</td>
              <td className="px-3 py-3 tabular-nums">{tons(row.donJaimeTons,2)}</td>
              <td className="px-3 py-3 tabular-nums">{tons(row.transportedTons,2)}</td>
              <td className="px-3 py-3 tabular-nums">{tons(row.stockConsumptionDeltaTons,2)}</td>
              <td className="px-3 py-3 tabular-nums">{tons(row.plantStockTons,2)}</td>
            </tr>)}</tbody>
          </table>
        </div>:<p className="text-sm text-muted-foreground">
          El archivo actual no incluye movimientos diarios normalizados.
        </p>}
      </div>
      <p className="px-4 py-3 text-xs text-muted-foreground">
        {stats?.source||'Estadística de extracción pendiente'} · corte {dmy(stats?.cutoff||null)}.
        El tonelaje de extracción y el stock no acreditan producción fina recuperada.
        Las tablas metalúrgicas históricas continúan debajo con su propia fecha de corte.
      </p>
    </div>:null}
  </section>;
}
