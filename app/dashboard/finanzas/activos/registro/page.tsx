'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type RegisterRow = {
  id: number;
  source_sheet: string | null;
  source_row: number | null;
  record_kind: string;
  description: string | null;
  acquisition_date: string | null;
  historical_asset: number | string | null;
  updated_asset: number | string | null;
  net_book_value: number | string | null;
  depreciation_current: number | string | null;
  total_accum_depr: number | string | null;
  remaining_life_months: number | string | null;
  cost_center_raw: string | null;
  canonical_asset_id: string | null;
  identity_status: string | null;
  identity_basis: string | null;
  source_payload: Record<string,unknown> | null;
};

type RegisterResponse = {
  source: null | { filename:string; cutoffDate:string|null; reviewStatus:string|null };
  summary?: {
    sourceRows:number;
    linkedRows:number;
    linkedAssets:number;
    singleAssets:number;
    conflictAssets:number;
  };
  page:number;
  pageSize:number;
  total:number;
  rows:RegisterRow[];
};

const fetcher=async(url:string):Promise<RegisterResponse>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar el registro financiero');
  return payload;
};

const money=(value:number|string|null)=>{
  if(value==null||value==='') return 'Sin base';
  const numeric=Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(numeric)
    : 'Sin base';
};
const number=(value:number)=>new Intl.NumberFormat('es-CL').format(value);

function statusLabel(row:RegisterRow){
  if(row.source_payload?.economic_identity_conflict===true) return {label:'Conflicto',variant:'destructive' as const};
  if(row.canonical_asset_id) return {label:'Enlazado',variant:'outline' as const};
  return {label:'Sin contraparte',variant:'secondary' as const};
}

export default function FinancialAssetRegisterPage(){
  const [status,setStatus]=useState('all');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const params=useMemo(()=>{
    const p=new URLSearchParams({status,page:String(page)});
    if(query.trim()) p.set('q',query.trim());
    return p.toString();
  },[status,page,query]);
  const {data,error,isLoading}=useSWR<RegisterResponse>(`/api/finance/asset-register?${params}`,fetcher,{revalidateOnFocus:false});

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
    <section>
      <Link href="/dashboard/finanzas/activos" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4"/> Economía de activos
      </Link>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finanzas · Activos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Registro financiero</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fuente completa de Daniel, preservada aunque una fila todavía no tenga contraparte operacional.</p>
      </div>
    </section>

    {data?.summary ? (
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Filas fuente" value={number(data.summary.sourceRows)} />
        <Metric label="Filas enlazadas" value={number(data.summary.linkedRows)} />
        <Metric label="Activos enlazados" value={number(data.summary.linkedAssets)} />
        <Metric label="Valor 1:1" value={number(data.summary.singleAssets)} />
        <Metric label="Conflictos" value={number(data.summary.conflictAssets)} />
      </section>
    ):null}

    <section className="rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['all','Todos'],
            ['linked','Enlazados'],
            ['unresolved','Sin contraparte'],
            ['conflict','Conflictos'],
          ].map(([key,label])=>(
            <button
              key={key}
              type="button"
              onClick={()=>{setStatus(key);setPage(1);}}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${status===key?'bg-foreground text-background':'bg-background hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2 lg:w-[360px]">
          <Search className="h-4 w-4 text-muted-foreground"/>
          <input
            value={query}
            onChange={(event)=>{setQuery(event.target.value);setPage(1);}}
            placeholder="Buscar descripción"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {isLoading ? <StatePanel tone="loading" title="Cargando registro financiero" className="border-0" /> : null}
      {error ? <StatePanel tone="error" title="No se pudo cargar el registro" description={error.message} className="border-0" /> : null}
      {data && !isLoading && !error ? (
        <>
          <div className="divide-y">
            {data.rows.map((row)=>{
              const statusInfo=statusLabel(row);
              return <div key={row.id} className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.45fr)_145px_145px_145px_155px_42px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{row.description||'Sin descripción'}</p>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.source_sheet||'Sin hoja'} · fila {row.source_row??'—'} · {row.cost_center_raw||'sin centro'}</p>
                </div>
                <Value label="Valor libro" value={money(row.net_book_value)} />
                <Value label="Depreciación período" value={money(row.depreciation_current)} />
                <Value label="Acumulada" value={money(row.total_accum_depr)} />
                <Value label="Vida remanente" value={row.remaining_life_months==null?'Sin base':`${row.remaining_life_months} meses`} />
                {row.canonical_asset_id ? (
                  <Link
                    href={`/dashboard/mantenimiento/equipos/${encodeURIComponent(row.canonical_asset_id)}/ficha`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
                    aria-label={`Abrir Ficha 360 de ${row.description||'activo'}`}
                  >
                    <ArrowLeft className="h-4 w-4 rotate-180"/>
                  </Link>
                ) : <span />}
              </div>;
            })}
            {data.rows.length===0?<StatePanel tone="neutral" title="No hay filas para este filtro" className="border-0" />:null}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>{number(data.total)} filas · página {data.page}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page<=1} onClick={()=>setPage((value)=>Math.max(1,value-1))} className="rounded-md border px-3 py-1.5 disabled:opacity-40">Anterior</button>
              <button type="button" disabled={page*data.pageSize>=data.total} onClick={()=>setPage((value)=>value+1)} className="rounded-md border px-3 py-1.5 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        </>
      ):null}
    </section>
  </div>;
}

function Metric({label,value}:{label:string;value:string}){
  return <div className="bg-card p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>;
}

function Value({label,value}:{label:string;value:string}){
  return <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium tabular-nums">{value}</p></div>;
}
