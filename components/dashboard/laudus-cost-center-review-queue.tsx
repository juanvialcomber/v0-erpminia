'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher=async(url:string)=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar la revisión Laudus');
  return payload;
};

export function LaudusCostCenterReviewQueue(){
  const {data,error,isLoading,mutate}=useSWR('/api/cost-centers/laudus-review',fetcher,{revalidateOnFocus:false});
  const [busy,setBusy]=useState<string|null>(null);
  const rows=Array.isArray(data?.queue)?data.queue:[];
  const summary=data?.summary;

  const decide=async(row:any,decision:'approve_proposal'|'reject_proposal'|'defer')=>{
    setBusy(row.laudus_external_id);
    try{
      const response=await fetch('/api/cost-centers/laudus-review',{
        method:'POST',
        credentials:'include',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({laudusExternalId:row.laudus_external_id,decision}),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(payload?.error||'No se pudo guardar la decisión');
      await mutate();
    }finally{setBusy(null);}
  };

  if(isLoading) return <StatePanel tone="loading" title="Revisando centros Laudus" description="Separando centros históricos de altas activas." />;
  if(error) return <StatePanel tone="error" title="No se pudo revisar Laudus" description={error.message} />;
  if(!rows.length) return null;

  return <section className="space-y-4" aria-label="Centros Laudus pendientes">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold">Altas Laudus por revisar</p>
        <p className="mt-1 text-sm text-muted-foreground">Los centros discontinuados quedan como historia. Estas propuestas no crean centros canónicos automáticamente.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{summary?.pending_active??0} activos</Badge>
        <Badge variant="outline">{summary?.pending_discontinued??0} históricos</Badge>
        <Badge variant="secondary">{summary?.active_asset_backed??0} con activo verificado</Badge>
      </div>
    </div>

    <div className="space-y-2">
      {rows.map((row:any)=><div key={row.laudus_external_id} className="grid gap-3 rounded-lg border p-4 lg:grid-cols-[110px_1fr_1fr_250px] lg:items-center">
        <div>
          <p className="font-semibold">{row.operational_code}</p>
          <Badge variant={row.exact_plate_asset_support?'secondary':'outline'}>{row.evidence_level}</Badge>
        </div>
        <div>
          <p className="font-medium">{row.laudus_name}</p>
          <p className="text-xs text-muted-foreground">Padre {row.canonical_parent_code||'sin resolver'} · {row.canonical_parent_name||'—'} · tipo sugerido {row.suggested_center_type||'por revisar'}</p>
        </div>
        <div>
          {row.asset_id?<><p className="font-medium">{row.asset_name}</p><p className="text-xs text-muted-foreground">{row.asset_code} · patente {row.license_plate} · coincidencia exacta</p></>:<p className="text-sm text-muted-foreground">Sin activo determinístico; revisar jerarquía y propósito.</p>}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {row.decision?<Badge variant="secondary">{row.decision==='approve_proposal'?'Aprobado':row.decision==='reject_proposal'?'Rechazado':'Después'}</Badge>:<>
            <Button size="sm" disabled={busy===row.laudus_external_id} onClick={()=>void decide(row,'approve_proposal')}>Aprobar propuesta</Button>
            <Button size="sm" variant="outline" disabled={busy===row.laudus_external_id} onClick={()=>void decide(row,'defer')}>Después</Button>
            <Button size="sm" variant="ghost" disabled={busy===row.laudus_external_id} onClick={()=>void decide(row,'reject_proposal')}>Rechazar</Button>
          </>}
        </div>
      </div>)}
    </div>
  </section>;
}
