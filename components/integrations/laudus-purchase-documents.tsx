'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { FileText, Search, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type InvoiceRow = {
  external_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  supplier_tax_id: string | null;
  issued_date: string | null;
  due_date: string | null;
  warehouse_name: string | null;
  net_amount: number | string | null;
  tax_amount: number | string | null;
  total_amount: number | string | null;
  currency: string | null;
  quality_flags: string[] | null;
};

type WaybillRow = {
  external_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  supplier_tax_id: string | null;
  warehouse_name: string | null;
  issued_date: string | null;
  notes: string | null;
  quality_flags: string[] | null;
};

type Payload = {
  summary: { invoices: number; waybills: number; visibleInvoices: number; visibleWaybills: number };
  invoices: InvoiceRow[];
  waybills: WaybillRow[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar documentos Laudus');
  return payload as Payload;
};

const money = (value: unknown, currency = 'CLP') => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: currency || 'CLP', maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(Number(value || 0));
  } catch {
    return `${currency || 'CLP'} ${Number(value || 0).toLocaleString('es-CL')}`;
  }
};

const date = (value: string | null) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';

export function LaudusPurchaseDocuments() {
  const { data, error, isLoading } = useSWR<Payload>('/api/integrations/laudus/purchase-documents', fetcher, { revalidateOnFocus: false });
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'invoices' | 'waybills'>('invoices');

  const needle = query.trim().toLowerCase();
  const invoices = useMemo(() => (data?.invoices || []).filter((row) => {
    if (!needle) return true;
    return `${row.doc_number || ''} ${row.supplier_name || ''} ${row.supplier_tax_id || ''} ${row.warehouse_name || ''}`.toLowerCase().includes(needle);
  }), [data?.invoices, needle]);
  const waybills = useMemo(() => (data?.waybills || []).filter((row) => {
    if (!needle) return true;
    return `${row.doc_number || ''} ${row.supplier_name || ''} ${row.supplier_tax_id || ''} ${row.warehouse_name || ''} ${row.notes || ''}`.toLowerCase().includes(needle);
  }), [data?.waybills, needle]);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Histórico Laudus</CardTitle>
            <CardDescription>Consulta de facturas y guías ya alojadas en MOTIL. Sólo lectura; Laudus conserva autoridad documental.</CardDescription>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('invoices')} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${mode === 'invoices' ? 'bg-foreground text-background' : 'bg-background'}`}>
              Facturas {data ? `(${data.summary.invoices.toLocaleString('es-CL')})` : ''}
            </button>
            <button type="button" onClick={() => setMode('waybills')} className={`rounded-md border px-3 py-1.5 text-xs font-medium ${mode === 'waybills' ? 'bg-foreground text-background' : 'bg-background'}`}>
              Guías {data ? `(${data.summary.waybills.toLocaleString('es-CL')})` : ''}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documento, proveedor, RUT o bodega" />
        </div>

        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando histórico Laudus…</p> : null}

        {!isLoading && !error && mode === 'invoices' ? (
          <div className="divide-y overflow-hidden rounded-lg border">
            {invoices.length ? invoices.map((row) => (
              <div key={row.external_id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.2fr)_140px_150px_150px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground"/><p className="font-medium">Factura {row.doc_number || 'sin número'}</p>{row.quality_flags?.length ? <Badge variant="outline">Revisar calidad</Badge> : <Badge variant="secondary">Fuente Laudus</Badge>}</div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.supplier_name || 'Proveedor sin nombre'} · {row.supplier_tax_id || 'Sin RUT'} · {row.warehouse_name || 'Sin bodega'}</p>
                </div>
                <div className="text-sm text-muted-foreground">{date(row.issued_date)}</div>
                <div className="text-sm text-muted-foreground">Vence {date(row.due_date)}</div>
                <div className="text-sm font-semibold tabular-nums lg:text-right">{money(row.total_amount, row.currency || 'CLP')}</div>
              </div>
            )) : <p className="p-6 text-center text-sm text-muted-foreground">No hay facturas para este filtro.</p>}
          </div>
        ) : null}

        {!isLoading && !error && mode === 'waybills' ? (
          <div className="divide-y overflow-hidden rounded-lg border">
            {waybills.length ? waybills.map((row) => (
              <div key={row.external_id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_160px_180px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground"/><p className="font-medium">Guía {row.doc_number || 'sin número'}</p>{row.quality_flags?.length ? <Badge variant="outline">Revisar calidad</Badge> : <Badge variant="secondary">Fuente Laudus</Badge>}</div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{row.supplier_name || 'Proveedor sin nombre'} · {row.supplier_tax_id || 'Sin RUT'}</p>
                  {row.notes ? <p className="mt-1 truncate text-xs text-muted-foreground">{row.notes}</p> : null}
                </div>
                <div className="text-sm text-muted-foreground">{date(row.issued_date)}</div>
                <div className="text-sm text-muted-foreground lg:text-right">{row.warehouse_name || 'Sin bodega'}</div>
              </div>
            )) : <p className="p-6 text-center text-sm text-muted-foreground">No hay guías para este filtro.</p>}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">Se muestran hasta 100 documentos recientes por tipo. La vista no crea, corrige ni contabiliza documentos.</p>
      </CardContent>
    </Card>
  );
}
