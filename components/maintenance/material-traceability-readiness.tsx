'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, Link2, PackageCheck, TriangleAlert, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type Row = {
  work_order_id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  asset_code: string | null;
  asset_name: string | null;
  requirement_lines: number;
  requirement_products: number;
  laudus_matched_products: number;
  part_lines: number;
  issued_qty: number;
  installed_qty: number;
  readiness: string;
  traceability_score: number;
};

type Payload = {
  summary: {
    modern_work_orders: number;
    material_intent_missing: number;
    with_requirements: number;
    with_part_trace: number;
    with_issued_materials: number;
    with_installed_materials: number;
    economic_trace_ready: number;
    requirements_with_full_laudus_history: number;
    completed_with_trace_gap: number;
    overall_traceability_score: number | null;
  };
  queue: Row[];
  semantics: Record<string,string>;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar trazabilidad económica.');
  return payload;
};

const LABELS: Record<string,{title:string;detail:string}> = {
  material_intent_missing: { title: 'Confirmar materiales', detail: 'Falta declarar si la OT utilizó materiales.' },
  inconsistent_no_materials: { title: 'Resolver inconsistencia', detail: 'La OT declara no usar materiales, pero mantiene requerimientos.' },
  materials_not_defined: { title: 'Definir materiales', detail: 'La OT declara uso de materiales, pero no tiene productos requeridos.' },
  requirements_without_part_trace: { title: 'Resolver abastecimiento', detail: 'Hay productos requeridos, pero aún no existe reserva/entrega trazada.' },
  reserved_not_issued: { title: 'Registrar entrega', detail: 'Existe reserva, pero Bodega todavía no registra la entrega a la OT.' },
  issued_not_installed: { title: 'Confirmar instalación', detail: 'Hay repuestos entregados pendientes de instalación o devolución.' },
  installed_without_full_laudus_context: { title: 'Completar contexto Laudus', detail: 'Existe instalación trazada, pero falta historial Laudus para parte de los SKU.' },
};

const n = (value: unknown) => new Intl.NumberFormat('es-CL').format(Number(value || 0));

export function MaintenanceMaterialTraceabilityReadiness() {
  const { data, error, isLoading, mutate } = useSWR<Payload>('/api/maintenance/material-traceability-readiness', fetcher, { revalidateOnFocus: false });
  if (isLoading) return <StatePanel tone="loading" title="Midiendo trazabilidad económica" description="Revisando OT, materiales, Bodega e historial Laudus." />;
  if (error || !data) return <StatePanel tone="error" title="No fue posible medir trazabilidad económica" description={error instanceof Error ? error.message : 'Sin datos disponibles.'} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} />;

  const s = data.summary;
  const metrics = [
    ['OT modernas', s.modern_work_orders, Wrench],
    ['Sin declarar materiales', s.material_intent_missing, TriangleAlert],
    ['Con requerimientos', s.with_requirements, PackageCheck],
    ['Con contexto Laudus completo', s.requirements_with_full_laudus_history, Link2],
  ] as const;

  return <section className="space-y-4">
    <Card className="shadow-none">
      <CardHeader className="gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Trazabilidad económica de OT</CardTitle>
            <CardDescription>Qué tan lejos llega hoy la cadena OT → material → Bodega → instalación → Activo 360 → Laudus.</CardDescription>
          </div>
          <Badge variant={s.economic_trace_ready > 0 ? 'secondary' : 'outline'}>{s.economic_trace_ready} OT con traza económica completa</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label,value,Icon]) => <div key={label} className="rounded-lg border p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{n(value)}</p></div>)}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Reserva / traza</p><p className="mt-1 text-xl font-semibold">{n(s.with_part_trace)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Entregadas</p><p className="mt-1 text-xl font-semibold">{n(s.with_issued_materials)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Instaladas</p><p className="mt-1 text-xl font-semibold">{n(s.with_installed_materials)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Completadas con brecha</p><p className="mt-1 text-xl font-semibold">{n(s.completed_with_trace_gap)}</p></div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">{data.semantics?.score} {data.semantics?.laudus_history}</p>
      </CardContent>
    </Card>

    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg">Cola de trazabilidad</CardTitle>
        <CardDescription>Primero las OT completadas con evidencia faltante. Una sola siguiente acción por fila.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.queue.length === 0 ? <StatePanel tone="neutral" title="Sin brechas de trazabilidad" description="Las OT actuales tienen cerrada su rama de materiales." className="min-h-40 border-0 bg-transparent" /> :
          <div className="divide-y rounded-lg border">
            {data.queue.map((row) => {
              const copy = LABELS[row.readiness] || { title: 'Revisar trazabilidad', detail: row.readiness };
              return <div key={row.work_order_id} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{row.work_order_number}</span>{row.status === 'completed' ? <Badge variant="outline">Completada</Badge> : null}</div>
                  <p className="mt-1 font-medium">{row.title || 'OT sin título'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.asset_name || row.asset_code || 'Activo no visible'}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.title}</p><p className="mt-1 text-sm">{copy.detail}</p></div>
                <div><p className="text-xs text-muted-foreground">Productos requeridos / con Laudus</p><p className="mt-1 text-sm font-medium">{n(row.requirement_products)} / {n(row.laudus_matched_products)}</p><p className="mt-1 text-xs text-muted-foreground">Instalado: {n(row.installed_qty)}</p></div>
                <Button asChild size="sm" variant="outline"><Link href={'/dashboard/mantenimiento/ordenes-trabajo/'+row.work_order_id}>Resolver<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </div>;
            })}
          </div>}
      </CardContent>
    </Card>
  </section>;
}
