'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, ClipboardList, Gauge, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type TerrainAction = {
  id: string;
  title: string;
  description: string;
  evidence: string;
  href: string;
};

type TerrainResponse = { actions?: TerrainAction[]; identityLinked?: boolean };

async function fetcher(url: string): Promise<TerrainResponse> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar tu trabajo.');
  return payload as TerrainResponse;
}

export function MobileTerrainPanel() {
  const { data, error, isLoading, mutate } = useSWR<TerrainResponse>(
    '/api/maintenance/my-work',
    fetcher,
    { revalidateOnFocus: false },
  );
  const nextAction = data?.actions?.[0] || null;
  const identityLinked = data?.identityLinked !== false;

  return (
    <section className="mx-auto w-full max-w-md space-y-4 py-1" aria-label="Trabajo en terreno">
      <header className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mantenimiento</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Trabajo de hoy</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Actualizar trabajo"
          onClick={() => void mutate()}
          disabled={isLoading}
        >
          <RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </header>

      <div className="grid gap-3" aria-label="Acciones principales">
        <Button asChild size="lg" className="h-16 w-full justify-between px-5 text-base">
          <Link href="/dashboard/mantenimiento/horometros/registrar">
            <span className="flex items-center gap-3"><Gauge className="h-5 w-5" />Registrar horómetro</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-14 w-full justify-between px-5 text-base">
          <Link href="/dashboard/mantenimiento/ordenes-trabajo">
            <span className="flex items-center gap-3"><ClipboardList className="h-5 w-5" />Mis tareas</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      {isLoading ? <StatePanel tone="loading" title="Buscando tu trabajo asignado" className="min-h-48" /> : null}
      {error ? <StatePanel tone="error" title="No se pudo cargar el trabajo" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} /> : null}
      {!isLoading && !error && !identityLinked ? <StatePanel tone="warning" title="Perfil aún no vinculado" description="Tu usuario todavía no está asociado a una persona operativa canónica. Jefatura o planificación debe completar esa asignación antes de entregarte una OT." className="min-h-48" /> : null}
      {!isLoading && !error && identityLinked && !nextAction ? <StatePanel tone="neutral" title="No tienes trabajo asignado" description="Cuando te asignen una OT activa, aparecerá aquí." className="min-h-48" /> : null}

      {!isLoading && !error && identityLinked && nextAction ? <Card className="overflow-hidden border-2 shadow-none">
        <CardContent className="space-y-5 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente trabajo</p>
            <h2 className="mt-2 text-xl font-semibold leading-tight">{nextAction.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{nextAction.description}</p>
          </div>
          <p className="border-l-2 pl-3 text-xs leading-5 text-muted-foreground">Evidencia: {nextAction.evidence}</p>
          <Button asChild size="lg" className="h-14 w-full text-base">
            <Link href={nextAction.href}>Abrir trabajo <ArrowRight className="h-5 w-5" /></Link>
          </Button>
        </CardContent>
      </Card> : null}


      <p className="px-2 text-center text-xs leading-5 text-muted-foreground">Sólo ves trabajo asignado a tu identidad operativa. El cierre requiere evidencia y validación del responsable.</p>
    </section>
  );
}
