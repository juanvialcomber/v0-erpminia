'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar proveedores');
  return payload;
};

const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));

type SupplierPerformance = {
  purchase_order_count: number;
  distinct_product_count: number;
  total_spend: number;
  average_order_value: number;
  last_purchase_date?: string | null;
  days_since_last_purchase?: number | null;
  warning_order_count: number;
  match_status?: string | null;
};

type SupplierRow = {
  id: string;
  tax_id: string | null;
  legal_name: string | null;
  trade_name: string | null;
  business_activity: string | null;
  payment_terms: string | null;
  region: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  validation_status: string | null;
  performance: SupplierPerformance | null;
};

type SuppliersResponse = {
  suppliers?: SupplierRow[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
};

export function SuppliersList() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
  };

  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (debouncedSearch) params.set('search', debouncedSearch);
  const { data, isLoading, error, mutate } = useSWR<SuppliersResponse>(`/api/compras/suppliers?${params}`, fetcher);
  const suppliers = data?.suppliers || [];
  const pagination = data?.pagination || { page: 0, pageSize: 50, total: 0, totalPages: 0 };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Buscar razón social, nombre, RUT o correo" />
      </div>

      {error ? <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4"><p className="text-sm text-destructive">No fue posible cargar los proveedores.</p><Button variant="outline" size="sm" onClick={() => void mutate()}>Reintentar</Button></div> : null}

      <Card className="overflow-hidden shadow-none">
        <CardContent className="p-0">
          <div className="hidden grid-cols-[minmax(260px,1.4fr)_140px_110px_140px_130px_120px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Proveedor</span><span>Órdenes</span><span>Productos</span><span>Gasto histórico</span><span>Última compra</span><span>Estado</span>
          </div>
          {isLoading ? <p className="p-8 text-sm text-muted-foreground">Cargando proveedores...</p> : null}
          {!isLoading && !suppliers.length ? <p className="p-8 text-center text-sm text-muted-foreground">No hay proveedores para esta búsqueda.</p> : null}
          {suppliers.map((supplier) => {
            const performance = supplier.performance;
            return (
              <Link key={supplier.id} href={`/dashboard/finanzas/proveedores/${supplier.id}`} className="grid gap-3 border-b px-4 py-4 transition-colors last:border-0 hover:bg-muted/40 lg:grid-cols-[minmax(260px,1.4fr)_140px_110px_140px_130px_120px] lg:items-center lg:gap-4">
                <div><p className="font-medium">{supplier.trade_name || supplier.legal_name || 'Proveedor sin nombre'}</p><p className="mt-1 text-xs text-muted-foreground">{supplier.tax_id || 'Sin RUT'} · {supplier.region || 'Sin región'}</p></div>
                <p className="text-sm"><span className="lg:hidden text-muted-foreground">Órdenes: </span>{Number(performance?.purchase_order_count || 0).toLocaleString('es-CL')}</p>
                <p className="text-sm"><span className="lg:hidden text-muted-foreground">Productos: </span>{Number(performance?.distinct_product_count || 0).toLocaleString('es-CL')}</p>
                <p className="text-sm font-medium"><span className="lg:hidden text-muted-foreground">Gasto histórico: </span>{money(performance?.total_spend)}</p>
                <p className="text-sm text-muted-foreground">{performance?.last_purchase_date || 'Sin compras'}</p>
                <Badge variant={supplier.is_active ? 'secondary' : 'outline'}>{supplier.is_active ? 'Activo' : 'Inactivo'}</Badge>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {pagination.totalPages > 1 ? <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{pagination.total.toLocaleString('es-CL')} proveedores · página {page + 1} de {pagination.totalPages}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pagination.totalPages - 1, value + 1))} disabled={page >= pagination.totalPages - 1}>Siguiente<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div> : null}
    </div>
  );
}
