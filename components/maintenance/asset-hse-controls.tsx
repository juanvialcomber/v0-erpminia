'use client';

import Link from 'next/link';
import useSWR from 'swr';

type LinkedControl = {
  control_id: string;
  rule_code: string;
  obligation: string;
  evidence_excerpt: string;
  source_file_path: string;
};

type Result = { controls: LinkedControl[]; restricted: boolean };

async function getLinkedControls(id: string): Promise<Result> {
  const modules = ['assets', 'maintenance'] as const;
  const results = await Promise.all(modules.map(async (moduleName) => {
    const response = await fetch(
      '/api/legal/hse-controls/linked?module=' + moduleName + '&id=' + encodeURIComponent(id),
      { credentials: 'include' },
    );
    if (response.status === 403) return { restricted: true, controls: [] as LinkedControl[] };
    if (!response.ok) throw new Error('No se pudo consultar HSE');
    const payload = await response.json() as { controls?: LinkedControl[] };
    return { restricted: false, controls: payload.controls || [] };
  }));
  if (results.some(result => result.restricted)) return { restricted: true, controls: [] };
  return { restricted: false, controls: Array.from(new Map(
    results.flatMap(result => result.controls).map(control => [control.control_id, control]),
  ).values()) };
}

export function AssetHseControls({ assetId }: { assetId: string }) {
  const { data, error, isLoading, mutate } = useSWR(
    assetId ? ['asset-hse-controls', assetId] : null,
    ([, id]) => getLinkedControls(id),
    { revalidateOnFocus: false },
  );
  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-label="Seguridad HSE del equipo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Seguridad y controles HSE</h2>
          <p className="mt-1 text-xs text-muted-foreground">Solo relaciones verificadas, con respaldo documental.</p>
        </div>
        <Link href="/dashboard/legal/hse-controls" className="text-xs underline underline-offset-4">Abrir controles HSE</Link>
      </div>
      {isLoading && <p role="status" className="mt-3 text-sm text-muted-foreground">Consultando controles aplicables…</p>}
      {error && <div role="alert" className="mt-3 text-sm">No fue posible consultar HSE. <button type="button" className="underline" onClick={() => mutate()}>Reintentar</button></div>}
      {!isLoading && !error && data?.restricted && (
        <p className="mt-3 text-sm text-muted-foreground">La evidencia HSE está restringida a usuarios con acceso a Legal. Solicite revisión al área responsable.</p>
      )}
      {!isLoading && !error && data && !data.restricted && data.controls.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Sin controles HSE vinculados y verificados para este registro. Esto no acredita ausencia de riesgos ni cumplimiento.</p>
      )}
      {data && !data.restricted && data.controls.length > 0 && (
        <ul className="mt-4 space-y-3">
          {data.controls.map(control => (
            <li key={control.control_id} className="rounded-md border p-3">
              <p className="text-sm font-semibold">{control.rule_code}</p>
              <p className="mt-1 text-sm">{control.obligation}</p>
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Consultar evidencia</summary>
                <p className="mt-2 whitespace-pre-wrap">{control.evidence_excerpt}</p>
                <p className="mt-2 break-all">{control.source_file_path.split('/').pop()}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
