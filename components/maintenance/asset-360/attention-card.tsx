// Tarjeta de atención operacional de la ficha 360.
// Extraída de asset-360-overview.tsx; consume las primitivas y helpers
// compartidos del mismo directorio.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { date, number } from './format';
import type { Asset360MaintenancePriority } from './planning-section';

export type Asset360Attention = {
  tone: string;
  title: string;
  detail: string;
};

export type Asset360ActionableWorkOrder = {
  work_order_id: string;
  work_order_number?: string | null;
  next_action?: string | null;
  ready_to_close?: boolean;
  standard_plan_steps_pending?: number | string | null;
};

export function Asset360AttentionCard({
  criticalOpen,
  overduePreventives,
  operationalBlockers,
  pendingPlanSteps,
  planningPriorityText,
  actionableWorkOrder,
  maintenancePriority,
}: {
  criticalOpen: number;
  overduePreventives: number;
  operationalBlockers: number;
  pendingPlanSteps: number;
  planningPriorityText: string;
  actionableWorkOrder: Asset360ActionableWorkOrder | null;
  maintenancePriority: Asset360MaintenancePriority | undefined;
}) {
  const attention: Asset360Attention = criticalOpen > 0
    ? { tone: 'border-destructive/40 bg-destructive/5', title: 'OT crítica abierta', detail: 'Revisar la orden crítica y su siguiente acción.' }
    : overduePreventives > 0
      ? { tone: 'border-amber-500/40 bg-amber-500/5', title: 'Preventivo vencido', detail: maintenancePriority?.recommended_action || 'Existe mantenimiento preventivo que requiere atención.' }
      : planningPriorityText.startsWith('P1')
        ? { tone: 'border-destructive/40 bg-destructive/5', title: planningPriorityText, detail: maintenancePriority?.recommended_action || 'Intervención prioritaria según planificación.' }
        : planningPriorityText.startsWith('P2')
          ? { tone: 'border-amber-500/40 bg-amber-500/5', title: planningPriorityText, detail: maintenancePriority?.recommended_action || 'Intervención próxima según planificación.' }
          : operationalBlockers > 0
            ? { tone: 'border-amber-500/40 bg-amber-500/5', title: 'Bloqueo operativo', detail: 'Existe una dependencia que impide avanzar o cerrar trabajo.' }
            : pendingPlanSteps > 0
              ? { tone: 'border-border bg-muted/20', title: 'Trabajo pendiente', detail: 'Quedan pasos de ejecución antes del cierre.' }
              : { tone: 'border-border bg-muted/10', title: 'Sin alertas operacionales', detail: 'No hay excepciones abiertas en la evidencia disponible.' };

  if (attention.title === 'Sin alertas operacionales') return null;

  return (
    <Card className={`shadow-none ${attention.tone}`}>
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Atención</p>
          <p className="mt-1 text-lg font-semibold">{attention.title}</p>
          {attention.detail ? <p className="mt-1 text-sm text-muted-foreground">{attention.detail}</p> : null}
        </div>
        {actionableWorkOrder ? (
          <Button asChild size="sm">
            <Link href={actionableWorkOrder.ready_to_close
                ? `/dashboard/mantenimiento/ordenes-trabajo/cierre?workOrderId=${encodeURIComponent(actionableWorkOrder.work_order_id)}`
                : `/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(actionableWorkOrder.work_order_id)}`}>
              {actionableWorkOrder.ready_to_close ? 'Revisar cierre' : 'Continuar trabajo'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        ) : null}
        {!actionableWorkOrder && maintenancePriority ? (
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            {maintenancePriority.remaining_meter != null ? (
              <p>
                Margen: {number(maintenancePriority.remaining_meter, 0)} {maintenancePriority.meter_unit || ''}
              </p>
            ) : null}
            {maintenancePriority.projected_due_at ? (
              <p className="mt-1">Proyección: {date(maintenancePriority.projected_due_at)}</p>
            ) : maintenancePriority.scheduled_date ? (
              <p className="mt-1">Programado: {date(maintenancePriority.scheduled_date)}</p>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/mantenimiento/planificacion">
                Ver planificación
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
