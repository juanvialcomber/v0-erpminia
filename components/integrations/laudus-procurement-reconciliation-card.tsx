'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, GitMerge } from 'lucide-react';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';
import { Button } from '@/components/ui/button';

type Payload = {
  summary: {
    total: number;
    supplier: {
      alreadyLinked: number;
      exactUniqueCandidates: number;
      conflicts: number;
      unresolved: number;
    };
    costCenter: {
      alreadyLinked: number;
      consensusCandidates: number;
      conflicts: number;
      unknownCode: number;
      unresolved: number;
    };
    fullyResolvable: number;
  };
  exceptions: unknown[];
  policy: 'preview_only';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular conciliación.');
  return payload;
};

const pct = (part: number, total: number) =>
  total ? `${((part / total) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : '0%';

export function LaudusProcurementReconciliationCard({ canEdit = false }: { canEdit?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/procurement-reconciliation',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  const [applying, setApplying] = useState(false);

  const applyBatch = async () => {
    if (applying || !data?.summary.fullyResolvable) return;
    setApplying(true);
    try {
      const response = await fetch('/api/integrations/laudus/procurement-reconciliation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible aplicar el lote.');
      const applied = Number(payload?.result?.applied || 0);
      const conflicts = Number(payload?.result?.conflicts || 0);
      toast.success(`Conciliación aplicada: ${applied} OC${conflicts ? ` · ${conflicts} conflictos revalidando` : ''}`);
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible aplicar el lote.');
    } finally {
      setApplying(false);
    }
  };

  if (error) return null;

  const total = data?.summary.total || 0;
  const fully = data?.summary.fullyResolvable || 0;
  const supplierOpen =
    (data?.summary.supplier.conflicts || 0) + (data?.summary.supplier.unresolved || 0);
  const ccOpen =
    (data?.summary.costCenter.conflicts || 0) +
    (data?.summary.costCenter.unknownCode || 0) +
    (data?.summary.costCenter.unresolved || 0);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Conciliación histórica de OC</h2>
          </div>
          <LaudusSourceMark state={isLoading ? 'syncing' : data ? 'connected' : 'pending'} />
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Vista determinística. La aplicación requiere acción humana y sólo completa campos faltantes; nunca sobrescribe valores existentes ni escribe en Laudus.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {canEdit ? (
            <Button size="sm" onClick={applyBatch} disabled={applying || !data?.summary.fullyResolvable}>
              {applying ? 'Aplicando…' : 'Aplicar 25 resolubles'}
            </Button>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">Solo lectura</span>
          )}
          <span className="text-xs text-muted-foreground">Cada OC se revalida dentro de la transacción antes de modificar MOTIL.</span>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">OC evaluadas</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : fully.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Completamente resolubles · {isLoading || !data ? '—' : pct(fully, total)}</p>
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            {supplierOpen === 0 ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            <p className="text-2xl font-semibold">{isLoading || !data ? '—' : supplierOpen.toLocaleString('es-CL')}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Proveedor sin resolver</p>
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            {ccOpen === 0 ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            <p className="text-2xl font-semibold">{isLoading || !data ? '—' : ccOpen.toLocaleString('es-CL')}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Centro de costo sin resolver</p>
        </div>
      </div>

      <div className="grid gap-px border-t bg-border md:grid-cols-2">
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Proveedor</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : data.summary.supplier.exactUniqueCandidates.toLocaleString('es-CL')} por nombre exacto y único · {isLoading || !data ? '—' : data.summary.supplier.conflicts.toLocaleString('es-CL')} conflictos.
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Centro de costo</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : data.summary.costCenter.consensusCandidates.toLocaleString('es-CL')} por consenso + código canónico · {isLoading || !data ? '—' : data.summary.costCenter.unknownCode.toLocaleString('es-CL')} códigos no reconocidos · {isLoading || !data ? '—' : data.summary.costCenter.conflicts.toLocaleString('es-CL')} conflictos.
          </p>
        </div>
      </div>
    </section>
  );
}
