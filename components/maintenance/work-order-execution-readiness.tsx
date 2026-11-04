'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, CircleDashed, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo verificar la preparación de la OT');
  return payload;
};

type ReleaseReadiness = {
  ready: boolean;
  emergencyBypass: boolean;
  blockers: Array<{ code: string; label: string; count?: number }>;
  checks: {
    asset: boolean;
    assignee: boolean;
    schedule: boolean;
    procurement: boolean;
    parts: boolean;
    materials: boolean;
    externalServices: boolean;
    labor: boolean;
    costConflict: boolean;
  };
};

const labels: Record<keyof ReleaseReadiness['checks'], string> = {
  asset: 'Activo',
  assignee: 'Responsable',
  schedule: 'Fecha',
  procurement: 'Compras',
  parts: 'Repuestos',
  materials: 'Materiales',
  externalServices: 'Servicios',
  labor: 'Horas',
  costConflict: 'Costo',
};

export function WorkOrderExecutionReadiness({
  workOrderId,
  status,
}: {
  workOrderId: string;
  assignedToName?: string | null;
  status?: string | null;
}) {
  const shouldCheck = !['in_progress', 'completed', 'cancelled', 'canceled'].includes(status || '');
  const { data, error, isLoading } = useSWR<ReleaseReadiness>(
    shouldCheck ? `/api/maintenance/work-orders/${workOrderId}/release-readiness` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (!shouldCheck) return null;

  return (
    <Card className="shadow-none" aria-label="Preparación para ejecutar">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Preparación para ejecutar</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Gate operacional previo al inicio. La OT no puede entrar a ejecución mientras existan bloqueos reales.
            </p>
          </div>
          {isLoading ? (
            <Badge variant="outline"><CircleDashed className="mr-1 h-3.5 w-3.5" />Verificando</Badge>
          ) : error ? (
            <Badge variant="destructive"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Sin verificar</Badge>
          ) : data?.ready ? (
            <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Liberada</Badge>
          ) : (
            <Badge variant="destructive"><ShieldAlert className="mr-1 h-3.5 w-3.5" />Bloqueada</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.emergencyBypass ? (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            OTe: mantiene excepción controlada de preparación para no retrasar respuesta. Activo y responsable siguen siendo obligatorios.
          </div>
        ) : null}

        {data ? (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(data.checks).map(([key, ok]) => (
              <div key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                {ok ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                <span>{labels[key as keyof ReleaseReadiness['checks']]}</span>
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && data && !data.ready ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium">Antes de iniciar</p>
            <div className="mt-2 space-y-1">
              {data.blockers.map((blocker) => (
                <p key={blocker.code} className="text-sm text-muted-foreground">
                  · {blocker.label}{blocker.count ? ` (${blocker.count})` : ''}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      </CardContent>
    </Card>
  );
}
