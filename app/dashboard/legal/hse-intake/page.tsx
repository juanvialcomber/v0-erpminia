'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type HseItem = { storage_id: string; extension?: string; bytes?: number; status?: string; sha256?: string };
type HseResult = { scope: string; offset: number; returned: number; has_more: boolean; items: HseItem[]; mutates_data: boolean };
export default function HseIntakeDiagnostics() {
  const [running,setRunning] = useState(false);
  const [result,setResult] = useState<HseResult | null>(null);
  const [error,setError] = useState<string | null>(null);
  async function probe() {
    setRunning(true); setError(null); setResult(null);
    try {
      const response = await fetch('/api/legal/hse-intake', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'No fue posible comprobar los documentos HSE.');
      if (!data || data.scope !== 'motil_hse' || !Array.isArray(data.items) || data.mutates_data !== false) throw new Error('Respuesta no válida del controlador HSE.');
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error de diagnóstico HSE'); }
    finally { setRunning(false); }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header className="border-b pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HSE · Diagnóstico administrativo</p>
        <h1 className="mt-2 text-2xl font-semibold">Verificar ingesta documental</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comprueba permisos y descarga de hasta 10 originales privados. Solo lectura: no importa ni aprueba documentos.</p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void probe()} disabled={running}>{running ? 'Verificando…' : 'Probar ingesta HSE'}</Button>
        <Link href="/dashboard/legal" className="text-sm underline underline-offset-4">Volver a Legal</Link>
      </div>
      {error && <StatePanel tone="error" title="Prueba no superada" description={error} />}
      {result && <section className="rounded-md border p-4 space-y-3" aria-live="polite">
        <h2 className="font-semibold">Resultado: {result.returned} archivos inspeccionados</h2>
        <p className="text-sm text-muted-foreground">Acceso autorizado. Ninguna fuente ni tabla canónica fue modificada. {result.has_more ? 'Hay más archivos por revisar.' : 'No se indican más archivos en este lote.'}</p>
        <div className="grid gap-2">
          {result.items.map((item,index) => <div key={item.storage_id || index} className="flex items-center justify-between gap-4 border-t pt-2 text-sm">
            <span>{index+1}. {(item.extension || 'archivo').toUpperCase()} · {typeof item.bytes === 'number' ? `${Math.round(item.bytes/1024)} KB` : 'tamaño desconocido'}</span>
            <span className={item.status === 'verified_bytes' ? 'text-emerald-700' : 'text-amber-700'}>{item.status === 'verified_bytes' ? 'SHA-256 verificado' : item.status || 'No verificado'}</span>
          </div>)}
        </div>
      </section>}
    </main>
  );
}
