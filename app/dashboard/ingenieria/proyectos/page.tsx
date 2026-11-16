'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ClipboardList, FolderKanban, GitBranch, Landmark, ShieldCheck, Users, FileText, BookOpen, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type Discovery = {
  portfolio: { status: string; projects: unknown[]; total: number | null };
  requests: { status: string; items: unknown[]; total: number | null };
  controls: { readOnly: boolean; approvalsEnabled: boolean; budgetsConnected: boolean; verifiedPhysicalProgressAvailable: boolean };
  nextAction: string;
};
const fetcher = async (url: string): Promise<Discovery> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo consultar Ingeniería y Proyectos');
  return result;
};
const units = [
  { title: 'Ingeniería', description: 'Planificación, preparación y coordinación técnica.' },
  { title: 'Servicios Generales', description: 'Trabajos y requerimientos internos de la compañía.' },
  { title: 'Contratistas Externos', description: 'Servicios contratados, evidencias y recepción de trabajos.' },
];
const workstreams = [
  { title: 'Solicitudes entre áreas', description: 'Ingreso por departamento, prioridad propuesta y trazabilidad de dos validaciones. Cambios urgentes al programa aprobado requieren Gerencia.', icon: Users },
  { title: 'Programación', description: 'Cartera, hitos, responsables, dependencias y versiones del programa.', icon: CalendarRange },
  { title: 'Avances', description: 'Informe consolidado, pendientes y avance físico respaldado por evidencia.', icon: FileText },
  { title: 'Asistente y normativa', description: 'Evaluación de presupuestos, borradores de informes y Manual de Carreteras con fuente y versión verificadas.', icon: BookOpen },
];
const stages = [
  { title: 'Solicitudes', description: 'Requerimientos de los departamentos, prioridades y firmas.' , icon: ClipboardList },
  { title: 'Programación', description: 'Hitos, recursos y cambios del programa aprobado.', icon: GitBranch },
  { title: 'Presupuesto', description: 'Versiones aprobadas, compromisos, gastos y pagos separados.', icon: Landmark },
];

export default function IngenieriaProyectosPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/ingenieria/proyectos', fetcher);
  return <main className="space-y-6">
    <PageHeader><PageHeaderContent>
      <PageHeaderEyebrow>Ingeniería · Cartera de trabajos</PageHeaderEyebrow>
      <PageHeaderTitle>Proyectos</PageHeaderTitle>
      <PageHeaderDescription>Solicitudes, programación y control. Los datos de planificación minera y Compras no se presentan como proyectos aprobados.</PageHeaderDescription>
    </PageHeaderContent></PageHeader>
    <div><Button variant="outline" size="sm" asChild><Link href="/dashboard/produccion/topografia"><ArrowLeft className="mr-2 h-4 w-4" />Volver a Topografía</Link></Button></div>
    {isLoading ? <StatePanel title="Cargando proyectos" description="Verificando permisos y fuentes de Ingeniería." className="min-h-0 py-5" /> : null}
    {error ? <StatePanel tone="error" title="No fue posible consultar Proyectos" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-5" /> : null}
    {data ? <>
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3" aria-label="Estado de la cartera">
        <div className="bg-card p-5"><p className="text-xs text-muted-foreground">Proyectos verificados</p><p className="mt-2 text-xl font-semibold">Sin inventario validado</p><p className="mt-1 text-xs text-muted-foreground">No equivale a cero proyectos.</p></div>
        <div className="bg-card p-5"><p className="text-xs text-muted-foreground">Solicitudes de proyectos</p><p className="mt-2 text-xl font-semibold">Circuito por definir</p><p className="mt-1 text-xs text-muted-foreground">Sin aprobaciones activadas.</p></div>
        <div className="bg-card p-5"><p className="text-xs text-muted-foreground">Avance y presupuesto</p><p className="mt-2 text-xl font-semibold">Sin conciliación</p><p className="mt-1 text-xs text-muted-foreground">No se atribuyen costos ni porcentajes ficticios.</p></div>
      </section>
      <StatePanel title="Falta incorporar la cartera canónica" description="Ingeniería informó aproximadamente 20 proyectos, pero no existe un inventario conciliado en esta vista. No se presentan registros de Compras, Topografía ni órdenes de trabajo como proyectos hasta contar con identidad y relación verificadas." className="min-h-0 py-5" />
      <section className="rounded-lg border bg-card p-5" aria-label="Componentes de Ingeniería">
        <div className="mb-4 flex items-center gap-2"><FolderKanban className="h-4 w-4" /><h2 className="font-semibold">Áreas de control</h2></div>
        <div className="grid gap-3 md:grid-cols-3">{stages.map(({title, description, icon: Icon}) =>
          <div key={title} className="rounded-md border p-4"><Icon className="h-4 w-4 text-muted-foreground" /><h3 className="mt-3 text-sm font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p><p className="mt-3 text-xs text-muted-foreground">Pendiente de validación</p></div>
        )}</div>
      </section>
      <section aria-label="Organización del departamento" className="space-y-3"><h2 className="text-base font-semibold">Organización</h2><div className="grid gap-3 md:grid-cols-3">{units.map(unit => <div key={unit.title} className="rounded-lg border p-4"><h3 className="font-medium">{unit.title}</h3><p className="mt-1 text-sm text-muted-foreground">{unit.description}</p></div>)}</div></section>
      <section aria-label="Circuitos de trabajo" className="space-y-3"><h2 className="text-base font-semibold">Circuitos de trabajo</h2><div className="grid gap-3 md:grid-cols-2">{workstreams.map(({title,description,icon:Icon}) => <div key={title} className="rounded-lg border p-4"><div className="flex items-center gap-2"><Icon className="h-4 w-4"/><h3 className="font-medium">{title}</h3></div><p className="mt-2 text-sm text-muted-foreground">{description}</p><p className="mt-2 text-xs text-muted-foreground">Pendiente de habilitación operativa</p></div>)}</div></section>
      <section className="flex gap-3 rounded-lg border p-5" aria-label="Próxima decisión">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div><h2 className="font-medium">Próxima validación</h2><p className="mt-1 text-sm text-muted-foreground">{data.nextAction}</p><p className="mt-2 text-xs text-muted-foreground">Esta versión es solo lectura; no crea, aprueba ni modifica proyectos.</p></div>
      </section>
    </> : null}
  </main>;
}
