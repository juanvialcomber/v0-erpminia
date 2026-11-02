'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {ArrowRight,RefreshCw} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {PageHeader,PageHeaderActions,PageHeaderContent,PageHeaderDescription,PageHeaderEyebrow,PageHeaderTitle} from '@/components/ui/page-header';
import {StatePanel} from '@/components/ui/state-panel';

type Connection={key:string;name:string;health:'healthy'|'degraded'|'attention'|'unknown';freshness:string|null;facts:string[];action:string;href:string};
type Payload={connections:Connection[];generatedAt:string;note:string};
const fetcher=async(url:string):Promise<Payload>=>{const r=await fetch(url,{credentials:'include',cache:'no-store'});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j?.error||'No se pudo cargar conectividad');return j;};
const label:Record<Connection['health'],string>={healthy:'Conectado',degraded:'Degradado',attention:'Requiere atención',unknown:'Sin confirmar'};
const freshness=(value:string|null)=>!value?'Sin corte único':new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Santiago'}).format(new Date(value));

export default function ConnectivityPage(){
 const {data,error,isLoading,mutate}=useSWR<Payload>('/api/maintenance/connectivity',fetcher,{revalidateOnFocus:false});
 return <div className="space-y-6">
  <PageHeader>
   <PageHeaderContent>
    <PageHeaderEyebrow>MOTIL · Control de fuentes</PageHeaderEyebrow>
    <PageHeaderTitle>Conectividad</PageHeaderTitle>
    <PageHeaderDescription>Estado real de las conexiones que alimentan la operación. Se evalúa frescura, avance canónico y conciliación; una llamada exitosa por sí sola no basta.</PageHeaderDescription>
   </PageHeaderContent>
   <PageHeaderActions><Button variant="outline" onClick={()=>void mutate()} disabled={isLoading}><RefreshCw className="h-4 w-4"/>Actualizar</Button></PageHeaderActions>
  </PageHeader>

  {isLoading?<StatePanel tone="loading" title="Verificando conexiones" description="Consultando fuentes, frescura y colas de conciliación."/>:null}
  {error?<StatePanel tone="error" title="No se pudo verificar conectividad" description={error.message} actions={<Button variant="outline" onClick={()=>void mutate()}>Reintentar</Button>}/>:null}

  {data?<section className="grid gap-3 lg:grid-cols-2">
   {data.connections.map(connection=><article key={connection.key} className="rounded-lg border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
     <div><h2 className="font-semibold">{connection.name}</h2><p className="mt-1 text-xs text-muted-foreground">{freshness(connection.freshness)}</p></div>
     <Badge variant={connection.health==='healthy'?'outline':'secondary'}>{label[connection.health]}</Badge>
    </div>
    <div className="mt-4 space-y-1">{connection.facts.map((fact,index)=><p key={index} className="text-sm text-muted-foreground">{fact}</p>)}</div>
    <div className="mt-4 border-t pt-3">
     <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Siguiente acción</p>
     <p className="mt-1 text-sm font-medium">{connection.action}</p>
     <Link href={connection.href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">Abrir flujo <ArrowRight className="h-3 w-3"/></Link>
    </div>
   </article>)}
  </section>:null}
  {data?<p className="text-xs text-muted-foreground">{data.note}</p>:null}
 </div>;
}
