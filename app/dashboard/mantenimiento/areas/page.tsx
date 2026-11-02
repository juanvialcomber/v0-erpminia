'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {ArrowRight,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {StatePanel} from '@/components/ui/state-panel';
import {PageHeader,PageHeaderActions,PageHeaderContent,PageHeaderDescription,PageHeaderEyebrow,PageHeaderTitle} from '@/components/ui/page-header';

type Area={key:string;name:string;status:'ready_for_review'|'current_source'|'review_required'|'baseline_loaded'|'awaiting_source';cutoff:string|null;facts:string[];nextAction:string;href:string};
type Response={areas:Area[];generatedAt:string;authority:string};
const fetcher=async(url:string):Promise<Response>=>{const r=await fetch(url,{credentials:'include',cache:'no-store'});const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j?.error||'No se pudo cargar el estado de áreas');return j;};
const date=(value:string|null)=>value?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):'Sin corte';
const statusLabel:Record<Area['status'],string>={
  ready_for_review:'Listo para revisar',
  current_source:'Fuente vigente',
  review_required:'Requiere validación',
  baseline_loaded:'Base cargada',
  awaiting_source:'Falta fuente',
};

export default function AreaReadinessPage(){
  const {data,error,isLoading,mutate}=useSWR<Response>('/api/maintenance/area-readiness',fetcher,{revalidateOnFocus:false});
  return <div className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Planificación · Ariel</PageHeaderEyebrow>
        <PageHeaderTitle>Estado de áreas</PageHeaderTitle>
        <PageHeaderDescription>Una vista para coordinar la reunión: evidencia disponible, brecha visible y siguiente acción. Cada jefe valida su propia información.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions><Button variant="outline" onClick={()=>void mutate()} disabled={isLoading}><RefreshCw className="h-4 w-4"/>Actualizar</Button></PageHeaderActions>
    </PageHeader>

    {error?<StatePanel tone="error" title="Estado de áreas no disponible" description={error.message} actions={<Button variant="outline" onClick={()=>void mutate()}>Reintentar</Button>}/>:null}
    {isLoading?<StatePanel tone="neutral" title="Actualizando áreas" description="Leyendo evidencia operativa y pendientes actuales."/>:null}

    {data?<section className="grid gap-3 lg:grid-cols-2">
      {data.areas.map(area=><article key={area.key} className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-semibold">{area.name}</h2><p className="mt-1 text-xs text-muted-foreground">{area.cutoff?'Corte '+date(area.cutoff):'Sin fecha de corte única'}</p></div>
          <Badge variant={area.status==='review_required'||area.status==='awaiting_source'?'secondary':'outline'}>{statusLabel[area.status]}</Badge>
        </div>
        <div className="mt-4 space-y-1">{area.facts.map((fact,index)=><p key={index} className="text-sm text-muted-foreground">{fact}</p>)}</div>
        <div className="mt-4 border-t pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Siguiente acción</p>
          <p className="mt-1 text-sm font-medium">{area.nextAction}</p>
          <Link href={area.href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">Abrir área <ArrowRight className="h-3 w-3"/></Link>
        </div>
      </article>)}
    </section>:null}

    {data?<p className="text-xs text-muted-foreground">{data.authority}</p>:null}
  </div>;
}
