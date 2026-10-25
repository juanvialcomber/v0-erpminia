'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ChevronDown, ChevronRight, Database, RefreshCw, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatePanel } from '@/components/ui/state-panel';
import { useCostCenters } from '@/hooks/use-cost-centers';
import {
  formatCostCenterLabel,
  getCostCenterPriority,
  getCostCenterRootCode,
  isActiveCostCenterStatus,
  isRootCostCenter,
  isVisibleCostCenter,
  repairCostCenterText,
  sortCostCenters,
  type CostCenterRecord,
} from '@/lib/cost-centers';

type Group = {
  rootCode: string;
  rootName: string;
  items: CostCenterRecord[];
};

type AdminResult = {
  tone: 'success' | 'error';
  title: string;
  description: string;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function CostCentersWorkspace() {
  const { costCenters, loading, error, reload } = useCostCenters();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adminOpen, setAdminOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [adminResult, setAdminResult] = useState<AdminResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => sortCostCenters(costCenters.filter((center) => isVisibleCostCenter(center.code))),
    [costCenters],
  );

  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term) return visible;
    return visible.filter((center) =>
      normalize(`${center.code} ${center.name} ${center.description || ''}`).includes(term),
    );
  }, [query, visible]);

  const groups = useMemo<Group[]>(() => {
    const result = new Map<string, Group>();
    for (const center of filtered) {
      const rootCode = isRootCostCenter(center.code) ? center.code : getCostCenterRootCode(center.code);
      const current = result.get(rootCode);
      if (current) {
        current.items.push(center);
      } else {
        result.set(rootCode, {
          rootCode,
          rootName: center.code === rootCode ? center.name : rootCode,
          items: [center],
        });
      }
    }
    return Array.from(result.values()).sort(
      (left, right) => getCostCenterPriority(left.rootCode) - getCostCenterPriority(right.rootCode),
    );
  }, [filtered]);

  const activeCount = visible.filter((center) => isActiveCostCenterStatus(center.status)).length;
  const rootCount = new Set(visible.map((center) => getCostCenterRootCode(center.code))).size;
  const leafCount = visible.filter((center) => !isRootCostCenter(center.code)).length;

  const toggle = (rootCode: string) => {
    setExpanded((current) => ({ ...current, [rootCode]: !current[rootCode] }));
  };

  const syncReference = async () => {
    setBusy(true);
    setAdminResult(null);
    try {
      const response = await fetch('/api/admin/seed-cost-centers', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo actualizar la lista de centros de costo');
      setAdminResult({
        tone: 'success',
        title: 'Lista actualizada',
        description: payload?.message || 'La lista de centros de costo quedó al día.',
      });
      reload();
    } catch (cause) {
      setAdminResult({
        tone: 'error',
        title: 'No se pudo actualizar la lista',
        description: cause instanceof Error ? cause.message : 'Error inesperado',
      });
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      setAdminResult({
        tone: 'error',
        title: 'No podemos leer este archivo',
        description: 'Elige una planilla o un archivo de movimientos descargado.',
      });
      return;
    }

    setBusy(true);
    setAdminResult(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/admin/import-cost-centers', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la lista de centros de costo');
      setAdminResult({
        tone: 'success',
        title: 'Lista actualizada',
        description: `${payload?.imported ?? 0} centros agregados · ${payload?.updated ?? 0} actualizados.`,
      });
      reload();
    } catch (cause) {
      setAdminResult({
        tone: 'error',
        title: 'No se pudo cargar la lista',
        description: cause instanceof Error ? cause.message : 'Error inesperado',
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === 'dragenter' || event.type === 'dragover');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  };

  if (loading) {
    return <StatePanel tone="loading" title="Cargando centros de costo" description="Consultando la lista vigente." />;
  }

  if (error) {
    return (
      <StatePanel
        tone="error"
        title="No fue posible cargar los centros de costos"
        description={error}
        actions={<Button variant="outline" onClick={reload}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button>}
      />
    );
  }

  if (visible.length === 0) {
    return <StatePanel tone="neutral" title="No hay centros de costo disponibles" description="Esta organización todavía no tiene centros de costo en la lista." />;
  }

  return (
    <div className="space-y-5">
      <section aria-label="Resumen de centros de costos" className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Centros vigentes', activeCount],
          ['Grupos principales', rootCount],
          ['Subcentros', leafCount],
          ['Resultados visibles', filtered.length],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por código, nombre o descripción"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="mr-2 h-4 w-4" />Actualizar vista
        </Button>
      </div>

      {groups.length === 0 ? (
        <StatePanel tone="neutral" title="Sin coincidencias" description="No hay centros que coincidan con la búsqueda actual." />
      ) : (
        <section className="overflow-hidden rounded-md border bg-card" aria-label="Estructura de centros de costos">
          {groups.map((group) => {
            const open = query.trim() ? true : Boolean(expanded[group.rootCode]);
            const items = sortCostCenters(group.items);
            const root = items.find((item) => item.code === group.rootCode);
            const children = items.filter((item) => item.code !== group.rootCode);
            const rootLabel = root
              ? formatCostCenterLabel(root)
              : `${group.rootCode} - ${repairCostCenterText(group.rootName)}`;

            return (
              <div key={group.rootCode} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(group.rootCode)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
                  aria-expanded={open}
                >
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{rootLabel}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{children.length} subcentros</span>
                </button>
                {open ? (
                  <div className="border-t bg-muted/10">
                    {children.length === 0 ? (
                      <p className="px-11 py-3 text-sm text-muted-foreground">Sin subcentros.</p>
                    ) : children.map((center) => (
                      <div key={center.id} className="grid gap-1 border-b px-11 py-2.5 last:border-b-0 md:grid-cols-[170px_minmax(0,1fr)] md:gap-4">
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">{center.code}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm">{repairCostCenterText(center.name)}</p>
                          {center.description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{repairCostCenterText(center.description)}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      <section className="border-t pt-4">
        <button
          type="button"
          onClick={() => setAdminOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 py-2 text-left"
          aria-expanded={adminOpen}
        >
          <div>
            <p className="text-sm font-medium">Administrar lista</p>
            <p className="text-xs text-muted-foreground">Opciones para actualizar o cargar la lista de centros de costo.</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
        </button>

        {adminOpen ? (
          <div className="mt-3 space-y-3 rounded-md border bg-muted/10 p-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void syncReference()}>
                <Database className="mr-2 h-4 w-4" />Actualizar lista
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />Cargar planilla
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </div>

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground ${dragActive ? 'bg-muted' : ''}`}
            >
              Suelta aquí una planilla o un archivo descargado desde el sistema contable. Solo administradores pueden actualizar la lista.
            </div>

            {adminResult ? (
              <StatePanel tone={adminResult.tone} title={adminResult.title} description={adminResult.description} className="min-h-0" />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
