'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { TechnicalGuidelineLibrary } from '@/components/maintenance/technical-guideline-library';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type ImportSummary = {
  summary: { sources: number; rows: number; accepted: number; reviewRequired: number };
};

const fetcher = async (url: string): Promise<ImportSummary> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las importaciones de Mantenimiento.');
  return payload as ImportSummary;
};

export default function MaintenanceSourcesPage() {
  const { data, error, isLoading, mutate } = useSWR<ImportSummary>('/api/maintenance/sources', fetcher, { revalidateOnFocus: false });
  const summary = !error ? data?.summary : undefined;

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mantenimiento · Evidencia</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Fuentes</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Consulta los archivos, sus versiones y la revisión de cada fuente. El origen disponible se indica por documento.
            La conciliación sólo convierte coincidencias verificables en datos canónicos.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/planificacion/datos">Revisar vínculos con equipos<ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </header>

      <section aria-label="Resumen de importaciones" className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Registros importados</h2>
          <p className="text-xs text-muted-foreground">Estos recuentos corresponden a importaciones estructuradas. La disponibilidad del archivo original se revisa en el catálogo.</p>
        </div>
        <div className="grid overflow-hidden rounded-lg border sm:grid-cols-4" aria-busy={isLoading}>
          {[
            ['Importaciones', summary?.sources],
            ['Filas registradas', summary?.rows],
            ['Importaciones aceptadas', summary?.accepted],
            ['Revisión requerida', summary?.reviewRequired],
          ].map(([label, value], index) => (
            <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{typeof value === 'number' ? value.toLocaleString('es-CL') : '—'}</p>
            </div>
          ))}
        </div>
        {error ? <StatePanel tone="error" title="Resumen de importaciones no disponible" description={error.message}
          actions={<Button variant="outline" onClick={() => void mutate()}><RefreshCw className="h-4 w-4" />Reintentar</Button>}
          className="min-h-0" /> : null}
      </section>

      <TechnicalGuidelineLibrary />
    </main>
  );
}
