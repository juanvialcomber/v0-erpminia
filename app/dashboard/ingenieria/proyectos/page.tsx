'use client';

import { SharedProjectPortfolio } from '@/components/project-control/shared-project-portfolio';
import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { MopEngineeringAssistant } from '@/components/engineering/mop-assistant';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type ProjectDraft = {
  id: string;
  project_name: string;
  requesting_area: string;
  need_summary: string;
  objective: string | null;
  location: string | null;
  target_date: string | null;
  source_reference: string | null;
  status: 'draft';
  created_at: string;
  updated_at: string;
};

type Discovery = {
  portfolio: { status: string; projects: ProjectDraft[]; total: number };
  controls: { approvalsEnabled: boolean; budgetsConnected: boolean; verifiedPhysicalProgressAvailable: boolean };
  nextAction: string;
};

type DraftForm = {
  project_name: string;
  requesting_area: string;
  need_summary: string;
  objective: string;
  location: string;
  target_date: string;
  source_reference: string;
};

const EMPTY_FORM: DraftForm = {
  project_name: '',
  requesting_area: '',
  need_summary: '',
  objective: '',
  location: '',
  target_date: '',
  source_reference: '',
};

const fieldClass = 'min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'grid gap-1.5 text-sm font-medium text-foreground';

const fetcher = async (url: string): Promise<Discovery> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'No se pudo consultar la cartera');
  return result;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value));
}

export default function IngenieriaProyectosPage() {
  const { data, error, isLoading, mutate } = useSWR<Discovery>('/api/ingenieria/proyectos', fetcher);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const projects = data?.portfolio.projects ?? [];
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [projects]);

  function change<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function edit(project: ProjectDraft) {
    setEditingId(project.id);
    setForm({
      project_name: project.project_name,
      requesting_area: project.requesting_area,
      need_summary: project.need_summary,
      objective: project.objective || '',
      location: project.location || '',
      target_date: project.target_date || '',
      source_reference: project.source_reference || '',
    });
    setSaved(false);
    document.getElementById('project-intake-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError('');
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const response = await fetch('/api/ingenieria/proyectos', {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: editingId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo guardar el borrador');
      await mutate();
      resetForm();
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No se pudo guardar el borrador');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Ingeniería y Proyectos</PageHeaderEyebrow>
          <PageHeaderTitle>Cartera</PageHeaderTitle>
          <PageHeaderDescription>Registra los proyectos que el equipo levantará y completa sus antecedentes por etapas.</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <SharedProjectPortfolio />

      <section className="flex flex-wrap items-center justify-between gap-3 border-y py-3" aria-label="Estado de la cartera">
        <div>
          <p className="text-sm font-medium">Fichas de proyecto</p>
          <p className="text-xs text-muted-foreground">{data ? String(data.portfolio.total) + ' borradores guardados' : 'El inventario se irá completando con Ingeniería.'}</p>
        </div>
        <p className="text-xs text-muted-foreground">Cada ficha parte como borrador; no aprueba alcance, presupuesto ni programa.</p>
      </section>

      {isLoading ? <StatePanel title="Cargando cartera" description="Verificando el acceso de Ingeniería." className="min-h-0 py-4" /> : null}
      {error ? <StatePanel tone="error" title="No fue posible cargar la cartera" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-4" /> : null}

      {data ? (
        <section id="project-intake-form" className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
          <form onSubmit={save} className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{editingId ? 'Continuar ficha' : 'Iniciar ficha de proyecto'}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Completa lo conocido. Los datos faltantes se pueden agregar después.</p>
              </div>
              {editingId ? <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancelar</Button> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Nombre del proyecto *
                <input className={fieldClass} required maxLength={160} value={form.project_name} onChange={event => change('project_name', event.target.value)} placeholder="Nombre utilizado por el equipo" />
              </label>
              <label className={labelClass}>
                Área solicitante *
                <input className={fieldClass} required maxLength={100} value={form.requesting_area} onChange={event => change('requesting_area', event.target.value)} placeholder="Área que origina la necesidad" />
              </label>
              <label className={labelClass}>
                Ubicación o instalación
                <input className={fieldClass} maxLength={200} value={form.location} onChange={event => change('location', event.target.value)} placeholder="Mina, planta, sector o instalación" />
              </label>
              <label className={labelClass}>
                Fecha objetivo
                <input className={fieldClass} type="date" value={form.target_date} onChange={event => change('target_date', event.target.value)} />
              </label>
            </div>

            <label className={labelClass}>
              Necesidad o problema *
              <textarea className={fieldClass + ' min-h-24 resize-y'} required maxLength={2500} value={form.need_summary} onChange={event => change('need_summary', event.target.value)} placeholder="¿Qué se necesita resolver y por qué?" />
              <span className="text-xs font-normal text-muted-foreground">Describe el antecedente conocido; la prioridad y la aprobación se revisan después.</span>
            </label>

            <label className={labelClass}>
              Objetivo o resultado esperado
              <textarea className={fieldClass + ' min-h-20 resize-y'} maxLength={1500} value={form.objective} onChange={event => change('objective', event.target.value)} placeholder="¿Qué debería quedar resuelto?" />
            </label>

            <label className={labelClass}>
              Fuente o antecedente
              <input className={fieldClass} maxLength={1000} value={form.source_reference} onChange={event => change('source_reference', event.target.value)} placeholder="Documento, correo, reunión o referencia" />
            </label>

            {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
            {saved ? <p role="status" className="text-sm text-emerald-700">Borrador guardado.</p> : null}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar borrador'}</Button>
              {!editingId && Object.values(form).some(Boolean) ? <Button type="button" variant="outline" onClick={resetForm}>Limpiar</Button> : null}
            </div>
          </form>

          <section aria-label="Fichas guardadas" className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Fichas guardadas</h2>
                <p className="text-sm text-muted-foreground">Borradores de levantamiento</p>
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">{sortedProjects.length}</span>
            </div>
            {sortedProjects.length ? (
              <ul className="divide-y rounded-lg border bg-card">
                {sortedProjects.map(project => (
                  <li key={project.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">{project.project_name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{project.requesting_area}{project.location ? ' · ' + project.location : ''}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Borrador · actualizado {formatDate(project.updated_at)}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => edit(project)}>Continuar</Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed p-5">
                <p className="text-sm font-medium">Aún no hay fichas de proyecto</p>
                <p className="mt-1 text-sm text-muted-foreground">Empieza con un proyecto actual y registra la fuente que respalda la información.</p>
              </div>
            )}
            <p className="text-xs leading-5 text-muted-foreground">Las fichas quedan en borrador hasta validar cartera, responsables y circuito de aprobación con La Patagua.</p>
          </section>
        </section>
      ) : null}

      {data ? (
        <details className="rounded-lg border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Asistente técnico y Manual de Carreteras</summary>
          <div className="pt-4">
            <MopEngineeringAssistant />
          </div>
        </details>
      ) : null}
    </main>
  );
}
