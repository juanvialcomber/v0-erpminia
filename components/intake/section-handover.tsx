'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';

type Handover = { owner_name: string; work_state: string; next_action: string; reopen_when: string; coverage: string; evidence_count: number | null };
type Payload = { rows: { id: string; label: string; sourceDate: string | null; handover: Handover }[];
  summary: { automaticOpen: number; humanReview: number; blocked: number }; truncated: boolean };
const labels: Record<string, string> = { human_review: 'Revisión del área', blocked: 'Bloqueado', processed: 'Procesado', duplicate: 'Origen ya procesado', ready: 'Por procesar', processing: 'En proceso', retry_scheduled: 'Reintento programado' };
const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('handover_unavailable');
  return response.json();
};

export function SectionHandover({ section }: { section: 'maintenance' | 'production' | 'finance' | 'hse' | 'data_health' }) {
  const { data, error, isLoading } = useSWR<Payload>(`/api/intake/handovers?section=${section}`, fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false });
  if (isLoading) return <p className="text-sm text-muted-foreground" role="status">Consultando traspasos…</p>;
  if (error || !data) return <p className="rounded-lg border p-4 text-sm text-muted-foreground" role="alert">No se pudieron verificar los traspasos de esta sección.</p>;
  if (!data.rows.length) return null;
  return <section className="rounded-lg border" aria-label="Traspasos de información">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div><h2 className="text-sm font-semibold">Información recibida</h2>
        <p className="mt-1 text-xs text-muted-foreground">Fuentes derivadas al área. Su recepción no equivale a aprobación.</p></div>
      <div className="flex flex-wrap gap-2"><Badge variant="outline">{data.summary.humanReview} en revisión</Badge>
        {data.summary.blocked > 0 && <Badge variant="outline">{data.summary.blocked} bloqueadas</Badge>}
        {data.summary.automaticOpen > 0 && <Badge variant="secondary">{data.summary.automaticOpen} por procesar</Badge>}</div>
    </div>
    <div className="divide-y border-t">{data.rows.map(row => <details key={row.id} className="p-4">
      <summary className="cursor-pointer text-sm"><span className="break-words font-medium">{row.label}</span>
        <span className="ml-2 text-xs text-muted-foreground">{labels[row.handover.work_state] || 'Estado por verificar'} · {row.handover.owner_name}</span></summary>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {row.sourceDate && <p>Corte del documento: <span className="text-foreground">{row.sourceDate}</span></p>}
        <p>{row.handover.next_action}</p><p className="text-xs">Se retoma cuando: {row.handover.reopen_when}</p>
        {row.handover.coverage !== 'scope_verified' && <p className="text-xs">El alcance analizado conserva limitaciones; consultar la fuente antes de validar.</p>}
      </div>
    </details>)}</div>
    {data.truncated && <p className="border-t p-3 text-xs text-muted-foreground">Vista parcial: existen más traspasos que los mostrados.</p>}
  </section>;
}
