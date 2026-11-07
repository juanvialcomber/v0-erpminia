'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, FolderCheck, UserRoundCog } from 'lucide-react';
import CarpetaArranquePage from '@/app/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/page';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type Coverage = {
  period:string;
  summary:{registered:number;with_folder:number;without_folder:number;in_review:number;approved:number};
  without_folder:Array<{id:string;name:string;has_folder:boolean;folder_status:string|null}>;
};

const fetcher=async(url:string)=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar cumplimiento mensual');
  return payload as Coverage;
};

function periodLabel(value?:string|null){
  if(!value)return 'Período actual';
  const date=new Date(`${value.slice(0,10)}T12:00:00-03:00`);
  return date.toLocaleDateString('es-CL',{month:'long',year:'numeric'});
}

export default function LegalContractorDocumentsPage() {
  const {data,error}=useSWR<Coverage>('/api/legal/eecc-coverage',fetcher,{revalidateOnFocus:false});

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Proveedores</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cumplimiento mensual</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifica que cada proveedor haya cargado la documentación correspondiente al mes en curso.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/compras/proveedores-360">
              Proveedor 360
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/documentos-gestion/eecc">
              <UserRoundCog className="mr-2 h-4 w-4" />
              Gestionar proveedores
            </Link>
          </Button>
        </div>
      </header>

      {error ? (
        <StatePanel tone="warning" title="Cumplimiento mensual no disponible" description="Las carpetas siguen accesibles abajo, pero no se pudo calcular la cobertura del período actual." className="min-h-0"/>
      ) : (
        <section className="overflow-hidden rounded-md border">
          <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Período</p>
              <h2 className="mt-1 text-base font-semibold capitalize">{periodLabel(data?.period)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">La cobertura se calcula sólo con carpetas del período actual.</p>
            </div>
            <FolderCheck className="h-4 w-4 text-muted-foreground"/>
          </div>

          <div className="grid sm:grid-cols-4">
            {[
              ['Proveedores',data?.summary.registered ?? '…'],
              ['Sin carpeta',data?.summary.without_folder ?? '…'],
              ['En revisión',data?.summary.in_review ?? '…'],
              ['Aprobados',data?.summary.approved ?? '…'],
            ].map(([label,value],index)=>(
              <div key={String(label)} className={`px-4 py-3 ${index?'border-t sm:border-l sm:border-t-0':''}`}>
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {data?.without_folder?.length ? (
            <div className="border-t">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Falta carpeta del mes</p>
                  <p className="mt-1 text-xs text-muted-foreground">Priorizar estos proveedores antes de revisar documentación ya cargada.</p>
                </div>
                <span className="text-xs text-muted-foreground">{data.summary.without_folder} pendientes</span>
              </div>
              <div className="divide-y border-t">
                {data.without_folder.slice(0,8).map((item)=>(
                  <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-sm">{item.name}</span>
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/dashboard/documentos-gestion/eecc">Revisar perfil <ArrowRight className="ml-1 h-4 w-4"/></Link>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : data ? (
            <div className="border-t px-4 py-3 text-sm text-muted-foreground">Todos los proveedores activos tienen carpeta para el período actual.</div>
          ) : null}
        </section>
      )}

      <details className="rounded-md border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Ver carpetas y documentos
        </summary>
        <div className="border-t">
          <CarpetaArranquePage legalContext />
        </div>
      </details>
    </div>
  );
}
