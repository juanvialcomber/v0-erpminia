'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, CircleAlert, Link2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type Row = {
  work_order_id: string;
  work_order_number: string;
  title: string | null;
  status: string;
  asset_code: string | null;
  asset_name: string | null;
  requirement_lines: number;
  part_lines: number;
  issued_qty: number;
  installed_qty: number;
  laudus_matched_products: number;
  requirement_products: number;
  readiness: string;
  traceability_score: number;
};

type Payload = {
  summary: {
    modern_work_orders: number;
    material_intent_missing: number;
    declared_no_materials: number;
    declared_uses_materials: number;
    with_requirements: number;
    with_part_trace: number;
    with_issued_materials: number;
    with_installed_materials: number;
    economic_trace_ready: number;
    requirements_with_full_laudus_history: number;
    completed_with_trace_gap: number;
    overall_traceability_score: number;
  };
  queue: Row[];
  semantics: Record<string,string>;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la cobertura de trazabilidad.');
  return payload;
};

const label: Record<string,string> = {
  material_intent_missing: 'Confirmar uso de materiales',
  inconsistent_no_materials: 'Resolver declaración inconsistente',
  materials_not_defined: 'Definir materiales',
  requirements_without_part_trace: 'Reservar / trazar repuestos',
  reserved_not_issued: 'Registrar entrega',
  issued_not_installed: 'Confirmar instalación o devolución',
  installed_without_full_laudus_context: 'Resolver vínculo Laudus',
};

const detail: Record<string,string> = {
  material_intent_missing: 'No sabemos todavía si la OT utilizó materiales.',
  inconsistent_no_materials: 'La OT dice que no usa materiales, pero conserva requerimientos activos.',
  materials_not_defined: 'La OT declara uso de materiales, pero no tiene productos requeridos.',
  requirements_without_part_trace: 'Hay productos requeridos, pero aún no existe traza de repuesto/reserva.',
  reserved_not_issued: 'Existe traza de repuesto, pero no entrega registrada.',
  issued_not_installed: 'Hay entrega registrada, pero falta instalación o devolución.',
  installed_without_full_laudus_context: 'El consumo está trazado, pero faltan SKU con historial Laudus.',
};

export function MaterialTraceabilityReadiness() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/maintenance/material-traceability-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (isLoading) return <StatePanel tone="loading" title="Midiendo trazabilidad económica" description="OT → materiales → repuestos → activo → Laudus." />;
  if (error || !data) return <StatePanel tone="error" title="No fue posible medir la trazabilidad" description={error instanceof Error ? error.message : 'Sin datos disponibles.'} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} />;

  const s = data.summary;
  return <Card className="shadow-none overflow-hidden">
    <CardHeader className="border-b">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="text-lg">Cobertura económica de las OT</CardTitle>
          <CardDescription>Qué tan completa está la cadena necesaria para convertir operación en costo de activo defendible.</CardDescription>
        </div>
        <Badge variant={s.completed_with_trace_gap > 0 ? 'secondary' : 'outline'}>{s.overall_traceability_score ?? 0}/100 cobertura</Badge>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="OT modernas" value={s.modern_work_orders} icon={Wrench} />
        <Metric label="Intención pendiente" value={s.material_intent_missing} icon={CircleAlert} />
        <Metric label="Con requerimientos" value={s.with_requirements} icon={Link2} />
        <Metric label="Con instalación" value={s.with_installed_materials} icon={CheckCircle2} />
        <Metric label="Economía trazable" value={s.economic_trace_ready} icon={CheckCircle2} />
      </div>

      <div className="border-t p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Dónde se corta la cadena</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.completed_with_trace_gap} OT completada(s) aún tienen una brecha de trazabilidad.</p>
          </div>
          <p className="text-xs text-muted-foreground">{s.requirements_with_full_laudus_history} OT con requerimientos tienen cobertura Laudus completa de sus SKU.</p>
        </div>

        {data.queue.length ? <div className="mt-4 divide-y rounded-lg border">{data.queue.slice(0,12).map((row) => <Link key={row.work_order_id} href={'/dashboard/mantenimiento/ordenes-trabajo/'+row.work_order_id} className="group grid gap-3 p-4 hover:bg-muted/30 lg:grid-cols-[minmax(0,1fr)_220px_110px] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">{row.work_order_number}</p>
              <Badge variant={row.status === 'completed' ? 'secondary' : 'outline'}>{row.status === 'completed' ? 'Completada' : row.status}</Badge>
            </div>
            <p className="mt-1 text-sm font-medium">{row.title || row.asset_name || row.asset_code || 'OT sin título'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail[row.readiness] || 'Revisar trazabilidad.'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Siguiente acción</p>
            <p className="mt-1 text-sm font-medium">{label[row.readiness] || 'Revisar'}</p>
          </div>
          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <span className="text-sm font-semibold tabular-nums">{row.traceability_score}/100</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
        </Link>)}</div> : <StatePanel tone="neutral" title="Cadena completa para las OT evaluadas" description="No hay brechas pendientes en la cobertura material/económica disponible." className="mt-4 min-h-0 py-6" />}
      </div>

      <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
        La cobertura mide evidencia del proceso, no calidad del mantenimiento ni ROI. Historial Laudus del SKU no equivale a consumo por el activo.
      </div>
    </CardContent>
  </Card>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Wrench }) {
  return <div className="bg-card p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>;
}
