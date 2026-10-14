'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';

type Control = {
  id: string;
  rule_code: string;
  domain: string;
  obligation: string;
  responsible_role: string | null;
  evidence_excerpt: string;
  validation_status: string;
  source_file_path: string;
};
const fetcher = async (url: string): Promise<{ controls: Control[]; readOnly: boolean }> => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('No fue posible consultar los controles HSE');
  return res.json();
};

export default function HseControlsPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/legal/hse-controls', fetcher, { revalidateOnFocus: false });
  const controls = data?.controls || [];
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <Link href="/dashboard/legal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a Legal
      </Link>
      <header className="space-y-2">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h1 className="text-2xl font-semibold">Revisión de controles HSE</h1></div>
        <p className="text-sm text-muted-foreground">Obligaciones extraídas de documentos fuente. Ninguna regla se aplica automáticamente sin validación.</p>
      </header>
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-md border px-4 py-3"><strong>{controls.length}</strong> controles identificados</div>
        <div className="rounded-md border px-4 py-3"><strong>{controls.filter(c => c.validation_status === 'pending').length}</strong> pendientes</div>
        <div className="rounded-md border px-4 py-3">Consulta de solo lectura</div>
      </div>
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando evidencia HSE…</p>}
      {error && <div role="alert" className="rounded-md border p-4 text-sm">No fue posible cargar la información. <button className="underline" onClick={() => mutate()}>Reintentar</button></div>}
      {!isLoading && !error && !controls.length && <p className="rounded-md border p-4 text-sm">No hay controles HSE disponibles para esta organización.</p>}
      <div className="space-y-3">
        {controls.map(control => (
          <article key={control.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{control.rule_code}</h2>
              <span className="rounded-md border px-2 py-1 text-xs">{control.validation_status === 'pending' ? 'Pendiente de revisión' : control.validation_status}</span>
            </div>
            <p className="text-sm">{control.obligation}</p>
            <p className="text-xs text-muted-foreground">Responsable propuesto: {control.responsible_role || 'Por determinar'} · Área: {control.domain}</p>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium"><FileText className="h-3.5 w-3.5" /> Evidencia documental</p>
              <blockquote className="whitespace-pre-wrap break-words text-xs leading-relaxed">{control.evidence_excerpt}</blockquote>
              <p className="mt-3 break-all text-[11px] text-muted-foreground">{control.source_file_path.split('/').pop()}</p>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
