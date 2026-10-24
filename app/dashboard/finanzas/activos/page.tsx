'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, Clock3, Link2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const fetcher=async (url:string)=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar la revisión');
  return payload;
};

const money=(value:unknown)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));
const number=(value:unknown)=>Number(value||0).toLocaleString('es-CL');

export default function FinanceAssetReviewPage(){
  const {data,error,isLoading,mutate}=useSWR('/api/finance/assets/laudus-review?limit=100',fetcher,{revalidateOnFocus:false});
  const [saving,setSaving]=useState<string|null>(null);
  const summary=data?.summary;
  const queue=Array.isArray(data?.queue)?data.queue:[];

  const decide=async(row:any,decision:'confirm_candidate'|'reject_candidate'|'defer')=>{
    setSaving(row.laudus_external_id);
    try{
      const response=await fetch('/api/finance/assets/laudus-review',{
        method:'POST',
        credentials:'include',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          laudusExternalId:row.laudus_external_id,
          candidateAssetId:row.canonical_asset_id,
          decision,
        }),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(payload?.error||'No se pudo guardar la decisión');
      await mutate();
    }finally{
      setSaving(null);
    }
  };

  return <div className="space-y-6">
    <section className="border-b pb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Finanzas · Activo 360</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Conciliación de activos Laudus</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Compara activos contables con activos operacionales. Una decisión de esta pantalla queda como evidencia y no modifica todavía el activo canónico.</p>
    </section>

    {error?<div className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error.message}</div>:null}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Activos Laudus" value={summary?number(summary.laudus_assets):'—'} />
      <Metric label="Activos MOTIL" value={summary?number(summary.canonical_assets):'—'} />
      <Metric label="Candidatos" value={summary?number(summary.candidate_rows):'—'} />
      <Metric label="Revisados" value={summary?number(summary.reviewed):'—'} />
    </section>

    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Qué revisar</CardTitle>
        <CardDescription>Primero candidatos fuertes; los many-to-one requieren especial cuidado porque varias filas Laudus compiten por el mismo activo MOTIL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading?<p className="text-sm text-muted-foreground">Cargando candidatos...</p>:null}
        {!isLoading&&!queue.length?<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay candidatos con evidencia suficiente.</p>:null}
        {queue.map((row:any)=>{
          const reviewed=Boolean(row.decision);
          return <div key={row.laudus_external_id} className="rounded-lg border p-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_52px_1fr_220px] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{row.laudus_name}</p><Badge variant="outline">{row.evidence_level}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">Laudus #{row.laudus_external_id} · {row.laudus_manufacturer||'sin fabricante'} · {row.laudus_model||'sin modelo'} · serie {row.laudus_serial_number||'no informada'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.acquisition_date||'sin fecha'} · {money(row.acquisition_cost)} · {row.supplier_name||'sin proveedor'} · factura {row.invoice_number||'no informada'}</p>
              </div>
              <div className="hidden items-center justify-center xl:flex"><Link2 className="h-4 w-4 text-muted-foreground"/></div>
              <div>
                <p className="font-semibold">{row.canonical_asset_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.canonical_asset_code} · {row.canonical_manufacturer||'sin fabricante'} · {row.canonical_model||'sin modelo'} · serie {row.canonical_serial_number||'no informada'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Similitud nombre {Number(row.best_name_similarity||0).toLocaleString('es-CL',{style:'percent',maximumFractionDigits:1})} · brecha {Number(row.score_gap||0).toLocaleString('es-CL',{style:'percent',maximumFractionDigits:1})} · {row.laudus_rows_for_candidate} fila(s) Laudus hacia este candidato</p>
              </div>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                {reviewed?<Badge variant="secondary">{row.decision==='confirm_candidate'?'Confirmado':row.decision==='reject_candidate'?'Rechazado':'Pendiente'}</Badge>:<>
                  <Button size="sm" disabled={saving===row.laudus_external_id} onClick={()=>void decide(row,'confirm_candidate')}><Check className="mr-1 h-4 w-4"/>Confirmar</Button>
                  <Button size="sm" variant="outline" disabled={saving===row.laudus_external_id} onClick={()=>void decide(row,'defer')}><Clock3 className="mr-1 h-4 w-4"/>Después</Button>
                  <Button size="sm" variant="ghost" disabled={saving===row.laudus_external_id} onClick={()=>void decide(row,'reject_candidate')}><X className="mr-1 h-4 w-4"/>Rechazar</Button>
                </>}
              </div>
            </div>
          </div>;
        })}
      </CardContent>
    </Card>

    <p className="text-xs text-muted-foreground">Fuente: Laudus + activos canónicos MOTIL. Confirmar aquí no modifica identidad canónica ni escribe en Laudus.</p>
  </div>;
}

function Metric({label,value}:{label:string;value:string}){
  return <Card className="shadow-none"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>;
}
