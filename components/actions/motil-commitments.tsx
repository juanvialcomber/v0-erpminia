'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';

type Commitment = {
  id: string;
  assignee_name: string;
  assignee_profile_id: string;
  title: string;
  detail: string;
  domain: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  due_date: string | null;
  source_reference: string;
  resolution_note: string | null;
  can_update: boolean;
};

type Payload = {
  items: Commitment[];
  scope: 'mine' | 'team';
  can_view_team: boolean;
  source: string;
  feature_available?: boolean;
};

async function fetcher(url: string): Promise<Payload> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || 'No se pudieron cargar las tareas');
  return payload;
}

const statusLabels: Record<Commitment['status'], string> = {
  open: 'Pendiente',
  in_progress: 'En curso',
  blocked: 'Bloqueada',
  done: 'Terminada',
};

const taskRoutes: Record<string, string> = {
  physical_counts: '/dashboard/bodega/verificar-stock',
  ot_materials: '/dashboard/bodega/materiales-mantenimiento',
  ot_clock: '/dashboard/mantenimiento/ordenes-trabajo',
};

function taskModuleHref(item: Commitment): string {
  const action = item.source_reference.split(':').pop() || '';
  return taskRoutes[action] ||
    (item.domain === 'maintenance'
      ? '/dashboard/mantenimiento/ordenes-trabajo'
      : '/dashboard/bodega');
}

export function MotilCommitments() {
  // Server rejects team scope for non-administrators; no client-side
  // role or email is trusted for authorization.
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/actions/commitments?scope=team',
    fetcher,
    { revalidateOnFocus: false },
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function change(item: Commitment, status: Commitment['status']) {
    setSaving(item.id);
    setMessage(null);
    try {
      const res = await fetch('/api/actions/commitments', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, status, note: notes[item.id] || '' }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'No se pudo guardar el estado');
      setNotes((current) => ({ ...current, [item.id]: '' }));
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar el estado');
    } finally {
      setSaving(null);
    }
  }

  if (data?.feature_available === false) return null;

  const items = data?.items || [];
  const pending = items.filter((item) => item.status !== 'done');
  const ordered = [...pending, ...items.filter((item) => item.status === 'done')];

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 md:p-5" aria-label="Compromisos operacionales">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Compromisos con responsable</p>
          <h2 className="mt-1 text-xl font-semibold">Bodega y Mantenimiento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.can_view_team
              ? 'Vista de equipo: compromisos por responsable.'
              : 'Sólo tus compromisos asignados.'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void mutate()} disabled={isLoading}>Actualizar</Button>
      </div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Cargando compromisos...</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      {!isLoading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Aún no hay compromisos registrados para esta cuenta.</p>
      )}
      {!isLoading && !error && items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {pending.length} pendiente(s) de {items.length} compromiso(s) consultado(s).
            Las tareas terminadas conservan su evidencia e historial.
          </p>
          <div className="divide-y">
            {ordered.map((item) => {
              const needsNote = item.status !== 'done';
              return (
                <div className="space-y-2 py-4 first:pt-0 last:pb-0" key={item.id}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{item.assignee_name}</span>
                    <span aria-label="Estado">{statusLabels[item.status]}</span>
                    <span>{item.priority === 'urgent' ? 'Urgente' : item.priority === 'high' ? 'Alta' : 'Normal'}</span>
                    {item.due_date && <span>Fecha: {item.due_date}</span>}
                  </div>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={taskModuleHref(item)}>Abrir módulo</Link>
                  </Button>
                  {item.resolution_note && <p className="text-xs text-muted-foreground">Último registro: {item.resolution_note}</p>}
                  {item.can_update && needsNote && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Resultado o motivo de bloqueo: ${item.title}`}
                        value={notes[item.id] || ''}
                        onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Evidencia del resultado o bloqueo"
                        maxLength={2000}
                        className="h-9 min-w-44 flex-1 rounded-md border bg-background px-3 text-sm"
                      />
                      {item.status !== 'in_progress' && <Button size="sm" variant="outline" disabled={saving === item.id} onClick={() => void change(item, 'in_progress')}>Iniciar</Button>}
                      <Button size="sm" disabled={saving === item.id || (notes[item.id] || '').trim().length < 8} onClick={() => void change(item, 'done')}>Terminar</Button>
                      <Button size="sm" variant="outline" disabled={saving === item.id || (notes[item.id] || '').trim().length < 8} onClick={() => void change(item, 'blocked')}>Bloquear</Button>
                    </div>
                  )}
                  {item.can_update && item.status === 'done' && data?.can_view_team && (
                    <Button size="sm" variant="outline" disabled={saving === item.id} onClick={() => void change(item, 'open')}>Reabrir para revisión</Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
