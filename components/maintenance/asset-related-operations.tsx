'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, FileText, PackageCheck, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import { formatWorkOrderDate } from '@/lib/maintenance/work-order-calendar-date.mjs';

type Product = { product_code?: string | null; name?: string | null; unit?: string | null } | null;
type WorkOrder = { id?: string; work_order_number?: string | null; title?: string | null; status?: string | null; priority?: string | null; work_type?: string | null; root_cause?: string | null; actual_duration_hours?: number | string | null } | null;
type Part = {
  id: string;
  work_order_id: string;
  quantity_requested?: number | null;
  quantity_reserved?: number | null;
  quantity_issued?: number | null;
  quantity_installed?: number | null;
  quantity_returned?: number | null;
  unit_cost?: number | string | null;
  status?: string | null;
  installed_at?: string | null;
  product?: Product;
  workOrder?: WorkOrder;
};
type Intervention = {
  id: string;
  work_order_id: string;
  parts_cost?: number | string | null;
  labor_cost?: number | string | null;
  effective_external_cost?: number | string | null;
  total_cost?: number | string | null;
  closed_at?: string | null;
  workOrder?: WorkOrder;
};
type EventRow = { id: number; work_order_id?: string | null; event_type?: string | null; event_at?: string | null; actor_name?: string | null; summary?: string | null };
type Asset360Response = {
  summary?: { activeWorkOrders:number; overduePreventives:number; installedPartLines:number; pendingPartLines:number; auditedInterventions:number };
  workOrders?: Array<{ work_order_id:string; work_order_number?:string|null; status?:string|null; priority?:string|null; work_type?:string|null; scheduled_date?:string|null; assigned_person_name?:string|null; flow_status?:string|null }>;
  preventives?: Array<{ schedule_id:string; task_name?:string|null; due_meter?:number|string|null; effective_current_meter?:number|string|null; remaining_hours?:number|string|null; alert_due?:boolean; hour_status?:string|null; generated_work_order_id?:string|null }>;
  auditedInterventions?: Intervention[];
  installedParts?: Part[];
  pendingParts?: Part[];
  recentEvents?: EventRow[];
};
type DocumentsResponse = { documents?: Array<{ id:string; title?:string|null; status?:string|null; canonical_section?:string|null; created_at?:string|null }> } | Array<{ id:string; title?:string|null; status?:string|null; canonical_section?:string|null; created_at?:string|null }>;

const fetcher = async (url:string) => {
  const response = await fetch(url,{credentials:'include',cache:'no-store'});
  const payload = await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error || 'No fue posible cargar la ficha operacional del equipo.');
  return payload;
};

const money = (value:unknown) => `$${Number(value || 0).toLocaleString('es-CL',{maximumFractionDigits:0})}`;
const qty = (value:unknown) => Number(value || 0).toLocaleString('es-CL',{maximumFractionDigits:2});
const date = (value?:string|null) => value ? new Date(value).toLocaleDateString('es-CL') : 'Sin fecha';

export function AssetRelatedOperations({ assetId }: { assetId:string }) {
  const {data,error,isLoading,mutate}=useSWR<Asset360Response>(assetId?`/api/maintenance/assets/${encodeURIComponent(assetId)}/operational-360`:null,fetcher,{revalidateOnFocus:false});
  const {data:docsData,error:docsError,mutate:mutateDocs}=useSWR<DocumentsResponse>(assetId?`/api/documents/list?module=mantenimiento&category=equipos&assetId=${encodeURIComponent(assetId)}`:null,fetcher,{revalidateOnFocus:false});

  if(isLoading) return <StatePanel tone="loading" title="Preparando operación del equipo" description="Reuniendo trabajos, repuestos, costos auditados, eventos y documentación."/>;
  if(error) return <StatePanel tone="error" title="No fue posible cargar la operación del equipo" description={error.message} actions={<Button variant="outline" onClick={()=>void mutate()}><RefreshCw className="h-4 w-4"/>Reintentar</Button>}/>;

  const summary=data?.summary;
  const orders=data?.workOrders || [];
  const preventives=data?.preventives || [];
  const interventions=data?.auditedInterventions || [];
  const installed=data?.installedParts || [];
  const pending=data?.pendingParts || [];
  const events=data?.recentEvents || [];
  const documents=Array.isArray(docsData)?docsData:(docsData?.documents || []);
  const pendingDocs=documents.filter((doc)=>['draft','pending_l1','pending_l2','en_revision_l1','en_revision_l2'].includes(String(doc.status || 'draft'))).length;

  return <div className="space-y-5">
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div><CardTitle className="text-base">Operación del equipo</CardTitle><CardDescription>Trabajo actual, próximos preventivos y evidencia necesaria para decidir sin salir de la ficha.</CardDescription></div>
        <Button variant="outline" size="sm" onClick={()=>{void mutate();void mutateDocs();}}><RefreshCw className="h-4 w-4"/>Actualizar</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['OT activas',summary?.activeWorkOrders ?? 0],
            ['Preventivos vencidos',summary?.overduePreventives ?? 0],
            ['Repuestos pendientes',summary?.pendingPartLines ?? 0],
            ['Intervenciones auditadas',summary?.auditedInterventions ?? 0],
            ['Documentos',documents.length],
          ].map(([label,value])=><div key={String(label)} className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{String(value)}</p></div>)}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border">
            <div className="border-b p-4"><h3 className="text-sm font-semibold">Próximos trabajos</h3><p className="mt-1 text-xs text-muted-foreground">OT activas y pautas por horas configuradas.</p></div>
            <div className="divide-y">
              {orders.length===0&&preventives.length===0?<div className="p-5 text-sm text-muted-foreground">No hay trabajos activos ni pautas horarias para este equipo.</div>:null}
              {orders.slice(0,6).map((order)=><Link key={order.work_order_id} href={`/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(order.work_order_id)}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"><div><div className="flex flex-wrap items-center gap-2"><Wrench className="h-4 w-4"/><p className="font-medium">{order.work_order_number || 'OT'}</p><Badge variant="outline">{order.flow_status || order.status || 'Pendiente'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{order.work_type || 'Trabajo'}{order.assigned_person_name?` · ${order.assigned_person_name}`:''}{order.scheduled_date?` · ${formatWorkOrderDate(order.scheduled_date) || 'Sin fecha programada'}`:''}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground"/></Link>)}
              {preventives.slice(0,6).map((item)=><Link key={item.schedule_id} href="/dashboard/mantenimiento/preventivo-horas" className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.task_name || 'Pauta horaria'}</p><Badge variant={item.alert_due?'destructive':'outline'}>{item.alert_due?'Vencido':item.hour_status || 'Pendiente'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Actual {item.effective_current_meter==null?'sin lectura':`${qty(item.effective_current_meter)} h`} · vence {item.due_meter==null?'sin base':`${qty(item.due_meter)} h`}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground"/></Link>)}
            </div>
          </section>

          <section className="rounded-lg border">
            <div className="border-b p-4"><h3 className="text-sm font-semibold">Historial operacional</h3><p className="mt-1 text-xs text-muted-foreground">Eventos recientes registrados por las OT del equipo.</p></div>
            {events.length===0?<div className="p-5 text-sm text-muted-foreground">Aún no hay eventos operacionales registrados.</div>:<div className="divide-y">{events.slice(0,10).map((event)=><div key={event.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{event.summary || event.event_type || 'Evento de mantenimiento'}</p><p className="mt-1 text-xs text-muted-foreground">{date(event.event_at)}{event.actor_name?` · ${event.actor_name}`:''}</p></div>{event.work_order_id?<Button asChild variant="ghost" size="icon-sm"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(event.work_order_id)}`}><ArrowRight className="h-4 w-4"/></Link></Button>:null}</div></div>)}</div>}
          </section>
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-base">Costo por intervención auditada</CardTitle><CardDescription>Último snapshot de cierre por OT; no usa el ledger histórico importado.</CardDescription></CardHeader>
        <CardContent>{interventions.length===0?<div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Todavía no existen cierres auditados para este equipo.</div>:<div className="divide-y rounded-lg border">{interventions.slice(0,8).map((item)=><div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-medium">{item.workOrder?.work_order_number || 'OT cerrada'} · {item.workOrder?.title || 'Intervención'}</p><p className="mt-1 text-xs text-muted-foreground">{date(item.closed_at)}{item.workOrder?.root_cause?` · Causa: ${item.workOrder.root_cause}`:''}</p><p className="mt-2 text-xs text-muted-foreground">Repuestos {money(item.parts_cost)} · Mano de obra {money(item.labor_cost)} · Externos {money(item.effective_external_cost)}</p></div><div className="text-right"><p className="font-semibold">{money(item.total_cost)}</p>{item.work_order_id?<Button asChild variant="ghost" size="sm" className="mt-1"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(item.work_order_id)}`}>Abrir<ArrowRight className="ml-1 h-4 w-4"/></Link></Button>:null}</div></div>)}</div>}</CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-base">Repuestos</CardTitle><CardDescription>Separación explícita entre instalados y pendientes en las OT de este activo.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4"/>Pendientes</h3><Badge variant={pending.length?'outline':'secondary'}>{pending.length}</Badge></div>{pending.length===0?<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay líneas de repuesto pendientes.</div>:<div className="divide-y rounded-lg border">{pending.slice(0,6).map((part)=>{const outstanding=Math.max(Number(part.quantity_requested||0)-Number(part.quantity_installed||0)-Number(part.quantity_returned||0),0);return <div key={part.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-medium">{part.product?.name || 'Producto canónico pendiente'}</p><p className="text-xs text-muted-foreground">{part.product?.product_code || 'Sin código'} · solicitado {qty(part.quantity_requested)} · pendiente {qty(outstanding)}</p></div>{part.work_order_id?<Button asChild variant="ghost" size="icon-sm"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(part.work_order_id)}`}><ArrowRight className="h-4 w-4"/></Link></Button>:null}</div>})}</div>}</div>
          <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Instalados</h3><Badge variant="outline">{installed.length}</Badge></div>{installed.length===0?<div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay instalaciones confirmadas.</div>:<div className="divide-y rounded-lg border">{installed.slice(0,6).map((part)=><div key={part.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-medium">{part.product?.name || 'Componente'}</p><p className="text-xs text-muted-foreground">{part.product?.product_code || 'Sin código'} · {qty(part.quantity_installed)} {part.product?.unit || ''} · {date(part.installed_at)}</p></div><span className="text-sm font-medium">{money(Number(part.quantity_installed||0)*Number(part.unit_cost||0))}</span></div>)}</div>}</div>
        </CardContent>
      </Card>
    </div>

    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4"/>Documentación del equipo</CardTitle><CardDescription>Resumen del expediente documental canónico de Mantenimiento.</CardDescription></div><Button asChild variant="outline" size="sm"><Link href={`/dashboard/mantenimiento/equipos/${encodeURIComponent(assetId)}/documentos`}>Abrir documentos<ArrowRight className="ml-1 h-4 w-4"/></Link></Button></CardHeader>
      <CardContent>{docsError?<p className="text-sm text-destructive">No fue posible cargar el resumen documental.</p>:<div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3"><div className="bg-card p-4"><p className="text-xs text-muted-foreground">Documentos</p><p className="mt-1 text-xl font-semibold">{documents.length}</p></div><div className="bg-card p-4"><p className="text-xs text-muted-foreground">En revisión</p><p className="mt-1 text-xl font-semibold">{pendingDocs}</p></div><div className="bg-card p-4"><p className="text-xs text-muted-foreground">Clasificados</p><p className="mt-1 text-xl font-semibold">{documents.filter((doc)=>doc.canonical_section&&doc.canonical_section!=='pendiente_clasificar').length}</p></div></div>}</CardContent>
    </Card>
  </div>;
}
