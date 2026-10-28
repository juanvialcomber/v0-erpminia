'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, ClipboardList, Gauge, RefreshCw, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type TerrainAction = {
  id: string;
  title: string;
  description: string;
  evidence: string;
  href: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priorityLabel: string;
  scheduledDate: string | null;
  daysUntil: number | null;
  timerStatus: string;
  isCritical: boolean;
  isRunning: boolean;
  isPaused: boolean;
};
type TerrainResponse = { actions?: TerrainAction[]; identityLinked?: boolean; generatedAt?: string };

async function fetcher(url: string): Promise<TerrainResponse> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar tu trabajo.');
  return payload as TerrainResponse;
}

function dateContext(action: TerrainAction) {
  if (action.daysUntil == null) return 'Sin fecha de programación';
  if (action.daysUntil < 0) return 'Fecha programada vencida';
  if (action.daysUntil === 0) return 'Hoy';
  if (action.daysUntil === 1) return 'Mañana';
  return 'En ' + action.daysUntil + ' días';
}

export function MobileTerrainPanel({ canCreateEmergencyWorkOrder = false }: { canCreateEmergencyWorkOrder?: boolean }) {
  const { data, error, isLoading, mutate, isValidating } = useSWR<TerrainResponse>(
    '/api/maintenance/my-work',
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );
  const actions = data?.actions || [];
  const critical = actions.filter((action) => action.isCritical);
  const running = actions.find((action) => action.isRunning);
  const identityLinked = data?.identityLinked !== false;
  const previousCritical = useRef(new Set<string>());
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!data) return;
    const ids = new Set((data.actions || []).filter((action) => action.isCritical).map((action) => action.id));
    if (hasLoaded.current) {
      const added = (data.actions || []).filter((action) => action.isCritical && !previousCritical.current.has(action.id));
      if (added.length) {
        toast.warning(added.length === 1 ? 'Nueva OT crítica asignada' : 'Nuevas OT críticas asignadas', {
          description: added.length === 1 ? added[0].title + ' · Revisa la prioridad antes de continuar.' : String(added.length) + ' órdenes necesitan revisión de prioridad.',
        });
      }
    }
    previousCritical.current = ids;
    hasLoaded.current = true;
  }, [data]);

  const suggested = critical.find((action) => action.id !== running?.id) || null;

  return (
    <section className="mx-auto w-full max-w-xl space-y-5 py-2" aria-label="Trabajo asignado en terreno">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mantenimiento · Terreno</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mis órdenes de trabajo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Elige qué OT atender. La prioridad es una recomendación; la decisión es tuya.</p>
        </div>
        <Button type="button" variant="outline" size="icon" aria-label="Actualizar órdenes asignadas"
          onClick={() => void mutate()} disabled={isLoading || isValidating}>
          <RefreshCw className={'h-4 w-4 ' + (isValidating ? 'animate-spin' : '')} />
        </Button>
      </header>

      {canCreateEmergencyWorkOrder ? (
        <Button asChild className="min-h-10 w-full">
          <Link href="/dashboard/mantenimiento/ordenes-trabajo/create?mode=emergency"><Siren className="mr-2 h-4 w-4" />Crear OTe de emergencia</Link>
        </Button>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-b pb-4">
        <p className="text-sm text-muted-foreground">{actions.length} OT activas asignadas</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/mantenimiento/horometros/registrar"><Gauge className="mr-2 h-4 w-4" />Registrar horómetro</Link>
        </Button>
      </div>

      {critical.length > 0 && suggested ? (
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold">OT crítica asignada · {suggested.title}</p>
            <p className="text-sm text-muted-foreground">{suggested.description}</p>
            <p className="text-sm">
              {running
                ? 'Recomendación: considera priorizar esta OT. Si cambias de trabajo, primero pausa la OT en curso y registra el motivo.'
                : 'Recomendación: revisa esta OT antes de iniciar otro trabajo.'}
            </p>
          </div>
        </div>
      ) : null}

      {isLoading ? <StatePanel tone="loading" title="Buscando tus órdenes asignadas" className="min-h-40" /> : null}
      {error ? <StatePanel tone="error" title="No se pudieron cargar las OT" description={error.message}
        actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} /> : null}
      {!isLoading && !error && !identityLinked ? (
        <StatePanel tone="warning" title="Perfil aún no vinculado"
          description="Tu usuario debe estar asociado a una persona operativa para recibir órdenes asignadas." />
      ) : null}
      {!isLoading && !error && identityLinked && actions.length === 0 ? (
        <StatePanel tone="neutral" title="No tienes OT activas asignadas"
          description="Cuando planificación te asigne una OT, aparecerá aquí aunque esté programada para la próxima semana." />
      ) : null}

      {!isLoading && !error && identityLinked && actions.length > 0 ? (
        <div className="divide-y overflow-hidden rounded-lg border bg-card" aria-label="Todas mis OT, ordenadas por prioridad y fecha">
          {actions.map((action) => (
            <Link key={action.id} href={action.href}
              className={'group flex min-h-24 items-center justify-between gap-3 p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ' +
                (action.isCritical ? 'border-l-4 border-l-destructive' : '')}
              aria-label={'Ver ' + action.title + ', prioridad ' + action.priorityLabel + ', ' + dateContext(action)}>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{action.title}</span>
                  <Badge variant={action.isCritical ? 'destructive' : 'outline'}>{action.priorityLabel}</Badge>
                  {action.isRunning ? <Badge>En ejecución</Badge> : action.isPaused ? <Badge variant="secondary">Pausada</Badge> : null}
                </div>
                <p className="text-sm leading-5">{action.description}</p>
                <p className="text-xs text-muted-foreground">{action.evidence} · {dateContext(action)}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                <ClipboardList className="h-4 w-4" /><span className="sr-only">Abrir orden</span><ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Todas las OT activas se muestran desde su asignación, incluidas las futuras. La pausa y el cierre mantienen trazabilidad y autorización.
      </p>
    </section>
  );
}
