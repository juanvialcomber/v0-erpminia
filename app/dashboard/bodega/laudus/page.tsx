'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Database, MapPin, Search, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type Item = {
  id: string;
  external_id: string;
  laudus_product_id: number | null;
  sku: string | null;
  description: string | null;
  unit_of_measure: string | null;
  sku_prefix: string | null;
  operational_category: string;
  inventory_eligibility: 'eligible' | 'review' | 'exclude';
  reconciliation_status: 'matched' | 'new_candidate' | 'conflict' | 'ignored' | 'pending';
  canonical_product_id: string | null;
  synced_at: string;
};

type Payload = {
  source: 'Laudus';
  readOnly: true;
  summary: {
    total: number;
    matched: number;
    new_candidate: number;
    conflict: number;
    eligible: number;
    review: number;
    exclude: number;
    synced_at: string | null;
  };
  filteredTotal: number;
  items: Item[];
  warehouses: { total: number; matched: number; new_candidate: number; conflict: number; synced_at?: string | null; items: Array<{ external_id: string; laudus_warehouse_id: number | null; name: string | null; address: string | null; county: string | null; city: string | null; state: string | null; reconciliation_status: string; motil_warehouse_id: string | null; }> };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar Laudus.');
  return payload;
};

const number = (value: number | null | undefined) =>
  typeof value === 'number' ? new Intl.NumberFormat('es-CL').format(value) : '—';

const dateTime = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value)) : '—';

const categoryLabel: Record<string, string> = {
  maintenance_supply: 'Mantención',
  safety_supply: 'EPP / HSE',
  process_consumable: 'Proceso',
  fixed_asset: 'Activo fijo',
  service: 'Servicio',
  general_supply: 'Suministro',
  other: 'Por clasificar',
};

export default function LaudusProductsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (status !== 'all') params.set('status', status);
    params.set('limit', '100');
    return '/api/integrations/laudus/products?' + params.toString();
  }, [query, status]);

  const { data, error, isLoading } = useSWR<Payload>(endpoint, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Fuente ERP</PageHeaderEyebrow>
          <PageHeaderTitle>Laudus</PageHeaderTitle>
          <PageHeaderDescription>
            Catálogo real recibido desde Laudus y conciliado contra MOTIL. Lectura solamente: ninguna diferencia modifica inventario automáticamente.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {error ? <StatePanel tone="error" title="No fue posible cargar Laudus" description={error.message} /> : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <Database className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold tabular-nums">{isLoading ? '—' : number(data?.summary.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Productos recibidos de Laudus</p>
        </div>
        <div className="bg-card p-4">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold tabular-nums">{isLoading ? '—' : number(data?.summary.matched)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Coincidencia exacta con MOTIL</p>
        </div>
        <div className="bg-card p-4">
          <TriangleAlert className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold tabular-nums">{isLoading ? '—' : number(data?.summary.new_candidate)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Nuevos candidatos</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Última carga</p>
          <p className="mt-2 text-lg font-semibold">{isLoading ? '—' : dateTime(data?.summary.synced_at)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Laudus · lectura</p>
        </div>
      </section>

      {!isLoading && data?.warehouses ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Bodegas Laudus</h2>
              <p className="text-sm text-muted-foreground">Ubicaciones reales del ERP. Se muestran como evidencia y no crean bodegas MOTIL automáticamente.</p>
            </div>
            <Badge variant="outline">{number(data.warehouses.total)} bodegas</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.warehouses.items.map((warehouse) => (
              <div key={warehouse.external_id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted"><MapPin className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <p className="font-medium">{warehouse.name || 'Bodega sin nombre'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">ID Laudus {warehouse.laudus_warehouse_id ?? warehouse.external_id}</p>
                    </div>
                  </div>
                  <Badge variant={warehouse.reconciliation_status === 'matched' ? 'outline' : 'secondary'}>{warehouse.reconciliation_status === 'matched' ? 'Conciliada' : 'Nueva'}</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{warehouse.address || 'Sin dirección'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{[warehouse.county, warehouse.city, warehouse.state].filter(Boolean).join(' · ') || 'Ubicación sin detalle'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Catálogo Laudus</h2>
          <p className="text-sm text-muted-foreground">
            Busca por SKU, descripción o familia operacional. Los datos originales permanecen trazables a Laudus.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar SKU o descripción Laudus" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full lg:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="matched">Conciliados</SelectItem>
              <SelectItem value="new_candidate">Nuevos en Laudus</SelectItem>
              <SelectItem value="eligible">Inventario elegible</SelectItem>
              <SelectItem value="review">Requiere revisión</SelectItem>
              <SelectItem value="exclude">No inventariable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <StatePanel tone="loading" title="Cargando Laudus" description="Leyendo el catálogo persistido en MOTIL." /> : null}

        {!isLoading && data ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              {number(data.filteredTotal)} registros · mostrando hasta 100
            </div>
            <div className="hidden grid-cols-[150px_1fr_130px_120px_130px] gap-4 border-b bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
              <span>SKU</span><span>Descripción Laudus</span><span>Tipo</span><span>Unidad</span><span>Estado</span>
            </div>
            {data.items.map((item) => (
              <div key={item.id} className="grid gap-2 border-b px-4 py-4 last:border-0 lg:grid-cols-[150px_1fr_130px_120px_130px] lg:items-center lg:gap-4">
                <div>
                  <p className="font-mono text-sm">{item.sku || 'Sin SKU'}</p>
                  <p className="text-xs text-muted-foreground">ID Laudus {item.laudus_product_id ?? item.external_id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">{item.description || 'Sin descripción'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.sku_prefix || 'Sin prefijo'} · {item.inventory_eligibility === 'eligible' ? 'Inventariable' : item.inventory_eligibility === 'exclude' ? 'No inventariable' : 'Revisar'}</p>
                </div>
                <p className="text-sm">{categoryLabel[item.operational_category] || item.operational_category}</p>
                <p className="text-sm">{item.unit_of_measure || '—'}</p>
                <div>
                  {item.reconciliation_status === 'matched' ? <Badge variant="outline">Conciliado</Badge> :
                    item.reconciliation_status === 'new_candidate' ? <Badge variant="secondary">Nuevo</Badge> :
                    item.reconciliation_status === 'conflict' ? <Badge variant="destructive">Conflicto</Badge> :
                    <Badge variant="outline">Pendiente</Badge>}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
