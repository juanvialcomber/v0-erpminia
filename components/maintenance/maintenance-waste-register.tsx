'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el registro');
  return payload;
};

type WasteRow = {
  id: string;
  waste_name: string;
  classification: string;
  quantity: number;
  unit: string;
  status: 'generated' | 'stored' | 'removed' | 'closed';
  generated_at: string;
  storage_location: string | null;
  destination_name: string | null;
  work_order: { id: string; work_order_number: string; title: string; workshop_site: string | null } | null;
  asset: { id: string; asset_code: string | null; name: string | null; asset_type: string | null; category: string | null; manufacturer: string | null; model: string | null; license_plate: string | null; cost_center_code: string | null; validation_status: string | null } | null;
};

const tabs = [
  ['generated','Generados'],
  ['stored','Por retirar'],
  ['history','Historial'],
] as const;

function labelStatus(status: WasteRow['status']) {
  if (status === 'generated') return 'Generado';
  if (status === 'stored') return 'Almacenado';
  if (status === 'removed') return 'Retirado';
  return 'Cerrado';
}

export function MaintenanceWasteRegister() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('generated');
  const { data, error, isLoading } = useSWR('/api/maintenance/waste', fetcher, { revalidateOnFocus: false });
  const rows = (data?.rows || []) as WasteRow[];
  const [search, setSearch] = useState('');
  const [site, setSite] = useState('all');
  const sites = Array.from(new Set(rows.map((row) => row.work_order?.workshop_site).filter(Boolean))).sort() as string[];
  const visible = rows.filter((row) => {
    const statusMatch = tab === 'history' ? row.status === 'removed' || row.status === 'closed' : row.status === tab;
    if (!statusMatch) return false;
    if (site !== 'all' && row.work_order?.workshop_site !== site) return false;
    const haystack = [row.waste_name,row.work_order?.work_order_number,row.asset?.asset_code,row.asset?.name,row.asset?.manufacturer,row.asset?.model,row.asset?.license_plate].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <header className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Mantenimiento</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Residuos</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Seguimiento desde la OT hasta almacenamiento, retiro y cierre. El registro apoya trazabilidad; no certifica cumplimiento regulatorio.
        </p>
      </header>

      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {[
          ['Generados', summary?.generated || 0],
          ['Por retirar', summary?.stored || 0],
          ['Peligrosos abiertos', summary?.hazardousOpen || 0],
          ['Por clasificar', summary?.toClassify || 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar equipo, OT o residuo" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
        <select value={site} onChange={(event) => setSite(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="all">Todas las ubicaciones</option>
          {sites.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <Button key={value} type="button" size="sm" variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}>
            {label}
          </Button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando registro…</p> : null}
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      {!isLoading && !error && visible.length === 0 ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">No hay residuos en este estado.</p> : null}

      <div className="overflow-hidden rounded-lg border">
        {visible.map((row) => (
          <div key={row.id} className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr_auto] md:items-center">
            <div>
              <p className="font-medium">{row.asset?.name || row.asset?.asset_code || 'Equipo sin identificar'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[row.asset?.asset_code,[row.asset?.manufacturer,row.asset?.model].filter(Boolean).join(' '),row.work_order?.workshop_site,row.work_order?.work_order_number].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-sm text-foreground">{row.waste_name}</p>
            </div>
            <p className="text-sm tabular-nums">{Number(row.quantity).toLocaleString('es-CL')} {row.unit === 'unit' ? 'un' : row.unit}</p>
            <Badge variant={row.classification === 'hazardous' ? 'destructive' : 'outline'}>
              {row.classification === 'hazardous' ? 'Peligroso' : row.classification === 'non_hazardous' ? 'No peligroso' : 'Por clasificar'}
            </Badge>
            <div>
              <p className="text-sm">{labelStatus(row.status)}</p>
              <p className="text-xs text-muted-foreground">{row.destination_name || row.storage_location || 'Sin ubicación registrada'}</p>
            </div>
            {row.work_order?.id ? <Button asChild size="sm" variant="ghost"><Link href={'/dashboard/mantenimiento/ordenes-trabajo/' + row.work_order.id}>Abrir OT</Link></Button> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
