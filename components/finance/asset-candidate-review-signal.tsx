'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CandidateSummaryResponse = {
  summary: {
    candidates: number;
    readyForReview: number;
    identityVerifiedSingleSource: number;
    modelOnlyNeedsOperationalIdentity: number;
    sourceCodeNeedsOperationalValidation: number;
  };
};

const fetcher=async(url:string):Promise<CandidateSummaryResponse>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar la revisión de activos');
  return payload;
};

const number=(value:number)=>new Intl.NumberFormat('es-CL').format(value);

export function AssetCandidateReviewSignal(){
  const {data,error,isLoading}=useSWR<CandidateSummaryResponse>(
    '/api/finance/missing-asset-candidates',
    fetcher,
    {revalidateOnFocus:false,refreshInterval:15*60*1000},
  );

  if(error) return null;

  const ready=Number(data?.summary?.readyForReview||0);
  const exact=Number(data?.summary?.identityVerifiedSingleSource||0);

  if(!isLoading && ready===0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Revisión de candidatas Ficha 360">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4"/>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Fichas 360 por revisar</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isLoading ? 'Actualizando evidencia…' : ready+' listas con doble respaldo · '+number(exact)+' identidades exactas de una fuente'}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/finanzas/activos/candidatas">Revisar candidatas<ArrowRight className="ml-2 h-4 w-4"/></Link>
      </Button>
    </section>
  );
}
