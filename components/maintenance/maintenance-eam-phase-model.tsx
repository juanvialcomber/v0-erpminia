'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, CircleDot, Clock3, ShieldAlert, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type PhaseKey = 'backlog' | 'planning' | 'prepared' | 'execution' | 'closeout' | 'approval' | 'history';

type EamRow = {
  id: string;
  workOrderNumber: string | null;
  title: string | null;
  priority: string | null;
  assignedToName: string | null;
  scheduledDate: string | null;
  phase: PhaseKey;
  nextAction: string;
  pendingPlanSteps: number;
  blockers: {
    procurement: number;
    parts: number;
    materials: number;
    externalServices: number;
    labor: number;
    costConflict: boolean;
  };
  asset?: { asset_code: string | null; name: string | null } | null;
  href: string;
};

type Response = {
  phases?: Array<{ phase: PhaseKey; count: number; urgent: number; rows: EamRow[] }>;
  summary?: {
    workOrders: number;
    open: number;
    blocked: number;
    assigned: number;
    scheduled: number;
    pendingApproval: number;
    approved: number;
    assignmentCoveragePct: number | null;
    schedulingCoveragePct: number | null;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el flujo EAM.');
  return payload as Response;
};

const meta: Record<PhaseKey, { step: string; label: string; description: string }> = {
  backlog: { step: '01', label: 'Backlog', description: 'Solicitud identificada; falta completar objeto técnico o responsable.' },
  planning: { step: '02', label: 'Planificar', description: 'Alcance, fecha, materiales, servicios y recursos antes de liberar.' },
  prepared: { step: '03', label: 'Preparar', description: 'OT programada y lista para pasar a ejecución controlada.' },
  execution: { step: '04', label: 'Ejecutar', description: 'Trabajo en terreno con tiempo, evidencia y consumo real.' },
  closeout: { step: '05', label: 'Cerrar', description: 'Causa, acciones, horómetro, fluidos, materiales y costo final.' },
  approval: { step: '06', label: 'Revisar', description: 'Ariel revisa evidencia y aprueba el cierre técnico.' },
  history: { step: '07', label: 'Aprender', description: 'Historial trazable para confiabilidad, costos y recurrencia.' },
};

function blockerCount(row: EamRow) {
  return row.blockers.procurement
    + row.blockers.parts
    + row.blockers.materials
    + row.blockers.externalServices
    + row.blockers.labor
    + (row.blockers.costConflict ? 1 : 0);
}

export function MaintenanceEamPhaseModel() {
  const { data, error, isLoading } = useSWR<Response>('/api/maintenance/eam-readiness', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando flujo EAM" className="min-h-64" />;
  if (error) return <StatePanel tone="error" title="No se pudo cargar el flujo EAM" description={error.message} className="min-h-64" />;

  const phases = data?.phases || [];
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen EAM">
        {[
          ['OT abiertas', summary?.open ?? '—', 'Trabajo operativo vigente'],
          ['Bloqueadas', summary?.blocked ?? '—', 'Materiales, servicios o costos'],
          ['Asignación', summary?.assignmentCoveragePct == null ? '—' : `${summary.assignmentCoveragePct}%`, 'Cobertura de responsable'],
          ['Programación', summary?.schedulingCoveragePct == null ? '—' : `${summary.schedulingCoveragePct}%`, 'Cobertura de fecha'],
        ].map(([label, value, detail]) => (
          <Card key={String(label)} className="shadow-none">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="grid divide-y md:grid-cols-7 md:divide-x md:divide-y-0">
          {phases.map((phase) => {
            const copy = meta[phase.phase];
            return (
              <div key={phase.phase} className="min-w-0 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{copy.step}</span>
                  {phase.urgent > 0 ? <Badge variant="destructive">{phase.urgent} P1/P2</Badge> : null}
                </div>
                <p className="mt-3 font-semibold">{copy.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{phase.count}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {phases.filter((phase) => phase.phase !== 'history' && phase.rows.length > 0).map((phase) => {
          const copy = meta[phase.phase];
          return (
            <Card key={phase.phase} className="shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{copy.label}</CardTitle>
                  <Badge variant="outline">{phase.count}</Badge>
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {phase.rows.map((row) => {
                  const blockers = blockerCount(row);
                  return (
                    <Link key={row.id} href={row.href} className="grid gap-3 px-5 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{row.workOrderNumber || 'OT'}</span>
                          {blockers > 0 ? <Badge variant="destructive">{blockers} bloqueo{blockers === 1 ? '' : 's'}</Badge> : null}
                          {row.pendingPlanSteps > 0 ? <Badge variant="outline">{row.pendingPlanSteps} paso{row.pendingPlanSteps === 1 ? '' : 's'}</Badge> : null}
                        </div>
                        <p className="mt-1 truncate font-medium">{row.title || 'Orden de trabajo'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[row.asset?.asset_code || row.asset?.name, row.assignedToName, row.scheduledDate].filter(Boolean).join(' · ') || 'Contexto pendiente'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {phase.phase === 'approval' ? <CheckCircle2 className="h-4 w-4" /> : blockers > 0 ? <ShieldAlert className="h-4 w-4" /> : phase.phase === 'execution' ? <Wrench className="h-4 w-4" /> : phase.phase === 'prepared' ? <Clock3 className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
                        <span>{row.nextAction}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Modelo derivado desde OT, activos, readiness de cierre y revisión humana. No crea un maestro paralelo. La aprobación final permanece en Ariel bajo el flujo operacional actual.
      </p>
    </div>
  );
}
