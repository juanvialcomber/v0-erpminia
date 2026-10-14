'use client';

import useSWR from 'swr';
import Link from 'next/link';

type Edge = { source_type: string; source_id: string; relationship: string; target_type: string; target_id: string; review_state: string };
async function fetchGraph(url: string): Promise<{ edges: Edge[] }> {
  const result = await fetch(url, { credentials: 'include' });
  if (!result.ok) throw new Error('No se pudo consultar el grafo documental');
  return result.json();
}

export function HseEvidenceGraphSummary() {
  const { data, error, isLoading, mutate } = useSWR('/api/legal/hse-controls/graph', fetchGraph, { revalidateOnFocus: false });
  const edges = data?.edges || [];
  const candidates = edges.filter(edge => edge.relationship === 'supports_candidate');
  const verified = edges.filter(edge => edge.relationship === 'linked_to');
  return (
    <section className="rounded-lg border p-4" aria-label="Grafo de evidencia documental">
      <h2 className="text-sm font-semibold">Trazabilidad de evidencia</h2>
      <p className="mt-1 text-xs text-muted-foreground">Relaciones explícitas entre fuente, control y operación. Una relación pendiente no acredita cumplimiento.</p>
      {isLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">Consultando relaciones documentales…</p>}
      {error && <p role="alert" className="mt-3 text-sm">No se pudieron consultar las relaciones. <button type="button" onClick={() => mutate()} className="underline">Reintentar</button></p>}
      {!isLoading && !error && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-lg font-semibold">{candidates.length}</p>
            <p className="text-xs text-muted-foreground">Fragmentos que sustentan controles candidatos</p>
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-lg font-semibold">{verified.length}</p>
            <p className="text-xs text-muted-foreground">Conexiones operacionales verificadas</p>
          </div>
          {candidates.length > 0 && (
            <div className="sm:col-span-2 rounded-md border p-3">
              <p className="mb-2 text-xs font-semibold">Controles documentales con fuente identificada</p>
              <ul className="space-y-2">
                {candidates.slice(0, 20).map(edge => (
                  <li key={edge.source_id + ':' + edge.target_id} className="flex items-center justify-between gap-3 text-xs">
                    <span>Control candidato · {edge.review_state === 'pending' ? 'Pendiente de revisión' : edge.review_state}</span>
                    <Link href={'#hse-control-' + encodeURIComponent(edge.target_id)} className="underline underline-offset-4">Ver evidencia del control</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {edges.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2">Sin relaciones documentales registradas.</p>}
        </div>
      )}
    </section>
  );
}
