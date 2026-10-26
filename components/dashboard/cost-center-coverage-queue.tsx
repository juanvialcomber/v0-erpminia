'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CostCenterRecord } from '@/lib/cost-centers';

type CoverageDomain = 'production' | 'maintenance' | 'procurement';

type CoverageRow = {
  id: string;
  domain: CoverageDomain;
  code: string;
  label: string;
  detail: string;
  canAssign: boolean;
};

type CoveragePayload = {
  rows: CoverageRow[];
  summary: {
    total: number;
    production: number;
    maintenance: number;
    procurement: number;
  };
};

const domainLabel: Record<CoverageDomain, string> = {
  production: 'Producción',
  maintenance: 'Mantención',
  procurement: 'Compras',
};

export function CostCenterCoverageQueue() {
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenterRecord[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [coverageResponse, centersResponse] = await Promise.all([
        fetch('/api/cost-centers/coverage', { credentials: 'include' }),
        fetch('/api/cost-centers', { credentials: 'include' }),
      ]);
      const coveragePayload = await coverageResponse.json().catch(() => null);
      const centersPayload = await centersResponse.json().catch(() => null);
      if (!coverageResponse.ok) throw new Error(coveragePayload?.error || 'No se pudo cargar la cobertura');
      if (!centersResponse.ok) throw new Error(centersPayload?.error || 'No se pudieron cargar los centros');
      setCoverage(coveragePayload as CoveragePayload);
      setCostCenters(Array.isArray(centersPayload) ? centersPayload : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = coverage?.rows || [];
  const assignable = useMemo(() => rows.filter((row) => row.canAssign).length, [rows]);

  const assign = async (row: CoverageRow) => {
    const costCenterId = selections[row.id];
    if (!costCenterId) return;
    setBusyId(row.id);
    setError(null);
    try {
      const response = await fetch('/api/cost-centers/coverage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: row.domain, recordId: row.id, costCenterId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo asignar el centro de costo');
      setSelections((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error inesperado');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <StatePanel tone="loading" title="Revisando asignaciones pendientes" description="Buscando registros sin centro de costo en los módulos que puedes ver." />;
  }

  if (error && !coverage) {
    return <StatePanel tone="error" title="No fue posible revisar las asignaciones" description={error} actions={<Button variant="outline" onClick={() => void load()}>Reintentar</Button>} />;
  }

  if (rows.length === 0) {
    return <StatePanel tone="success" title="Sin asignaciones pendientes" description="Todos los registros visibles tienen centro de costo." />;
  }

  return (
    <section className="space-y-4" aria-label="Cobertura de centros de costo">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Pendientes por asignar</p>
          <p className="mt-1 text-sm text-muted-foreground">Asigna sólo cuando exista respaldo suficiente. MOTIL no completa ni reemplaza asignaciones por suposición.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{coverage?.summary.production ?? 0} Producción</Badge>
          <Badge variant="outline">{coverage?.summary.maintenance ?? 0} Mantención</Badge>
          <Badge variant="outline">{coverage?.summary.procurement ?? 0} Compras</Badge>
          <Badge variant={assignable ? 'default' : 'outline'}>{assignable} por asignar</Badge>
        </div>
      </div>

      {error ? <StatePanel tone="error" title="No se completó la última asignación" description={error} className="min-h-0" /> : null}

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Origen</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Centro de costo</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.domain}-${row.id}`}>
                <TableCell><Badge variant="outline">{domainLabel[row.domain]}</Badge></TableCell>
                <TableCell>
                  <div className="max-w-sm">
                    <p className="truncate font-medium">{row.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.code || row.id}</p>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.detail || 'Pendiente'}</TableCell>
                <TableCell>
                  {row.canAssign ? (
                    <Select value={selections[row.id] || ''} onValueChange={(value) => setSelections((current) => ({ ...current, [row.id]: value }))}>
                      <SelectTrigger size="sm" className="w-[260px] max-w-[65vw]">
                        <SelectValue placeholder="Seleccionar centro" />
                      </SelectTrigger>
                      <SelectContent>
                        {costCenters.map((center) => (
                          <SelectItem key={center.id} value={center.id}>{center.code} · {center.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sólo lectura</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    disabled={!row.canAssign || !selections[row.id] || busyId === row.id}
                    onClick={() => void assign(row)}
                  >
                    {busyId === row.id ? 'Asignando…' : 'Asignar'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
