'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CertifiedFinancialSummary } from '@/components/finance/certified-financial-summary';
import { StatePanel } from '@/components/ui/state-panel';
import { financeAmount, financeStatusLabel } from '@/lib/finance-ui-labels';

type CostCenter = {
  cost_center_code: string;
  name: string;
  full_path: string | null;
  budget_annual: number;
  budget_available: number;
  budget_usage_pct: number | null;
  financial_status: string;
};

type ActualCost = { id: number; transaction_date: string; asset_code: string | null; category: string | null; document_number: string | null; description: string | null; total_cost: number };
type PurchaseOrder = { id: string; order_number: string; order_date: string; supplier_name: string | null; total_amount: number };
type WorkOrder = { id: string; work_order_number: string; title: string; status: string; assigned_to_name: string | null };
type Asset = { id: string; asset_code: string; name: string; category: string | null; status: string | null };
type Response = { costCenter: CostCenter; actualCosts: ActualCost[]; purchaseOrders: PurchaseOrder[]; workOrders: WorkOrder[]; assets: Asset[] };

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('No se pudo cargar la información del centro de costo. Inténtalo de nuevo.');
  return payload;
};

const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('es-CL').format(new Date(value)) : '—';

export default function CostCenterProfilePage() {
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<Response>(params.id ? `/api/finance/cost-centers/${params.id}` : null, fetcher);

  if (isLoading) return <StatePanel tone="loading" title="Cargando centro de costo" />;
  if (error) return <StatePanel tone="error" title="No fue posible cargar el centro de costo" description={error.message} />;
  if (!data) return null;

  const center = data.costCenter;
  const budgets = [
    { label: 'Presupuesto operativo', value: financeAmount(center.budget_annual) },
    { label: 'Disponible operativo', value: financeAmount(center.budget_available) },
  ];

  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-4">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
          <Link href="/dashboard/finanzas/centros"><ArrowLeft className="mr-2 h-4 w-4" />Centros de costo</Link>
        </Button>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{center.cost_center_code}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{center.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{center.full_path || 'Centro de costo'}</p>
          </div>
          <Badge variant="outline">{financeStatusLabel(center.financial_status, 'financial')}</Badge>
        </div>
      </section>

      <CertifiedFinancialSummary entity="cost-center" id={center.cost_center_code} />

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2" aria-label="Presupuesto del centro de costo">
        {budgets.map((item) => (
          <div key={item.label} className="bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Gastos registrados</h2>
          <div className="divide-y divide-border/70 border-t border-border/70">
            {data.actualCosts.length ? data.actualCosts.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-4 py-3">
                <div><p className="text-sm font-medium">{row.description || row.category || 'Movimiento'}</p><p className="text-xs text-muted-foreground">{date(row.transaction_date)} · {row.asset_code || row.document_number || 'Sin referencia'}</p></div>
                <p className="text-sm font-medium tabular-nums">{financeAmount(row.total_cost)}</p>
              </div>
            )) : <p className="py-3 text-sm text-muted-foreground">No hay gastos asociados a este centro de costo.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Órdenes de compra</h2>
          <div className="divide-y divide-border/70 border-t border-border/70">
            {data.purchaseOrders.length ? data.purchaseOrders.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-4 py-3">
                <div><p className="text-sm font-medium">{row.order_number}</p><p className="text-xs text-muted-foreground">{row.supplier_name || 'Sin proveedor'} · {date(row.order_date)}</p></div>
                <p className="text-sm font-medium tabular-nums">{financeAmount(row.total_amount)}</p>
              </div>
            )) : <p className="py-3 text-sm text-muted-foreground">Sin compromisos asociados.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Órdenes de trabajo</h2>
          <div className="divide-y divide-border/70 border-t border-border/70">
            {data.workOrders.length ? data.workOrders.map((row) => (
              <Link key={row.id} href={`/dashboard/mantenimiento/ordenes/${row.id}`} className="block py-3 hover:text-primary">
                <p className="text-sm font-medium">{row.work_order_number} · {row.title}</p>
                <p className="text-xs text-muted-foreground">{financeStatusLabel(row.status, 'maintenance')} · {row.assigned_to_name || 'Sin responsable'}</p>
              </Link>
            )) : <p className="py-3 text-sm text-muted-foreground">Sin órdenes de trabajo asociadas.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">Activos relacionados</h2>
          <div className="divide-y divide-border/70 border-t border-border/70">
            {data.assets.length ? data.assets.map((row) => (
              <Link key={row.id} href={`/dashboard/mantenimiento/equipos/${row.id}`} className="block py-3 hover:text-primary">
                <p className="text-sm font-medium">{row.asset_code} · {row.name}</p>
                <p className="text-xs text-muted-foreground">{row.category || 'Activo'} · {financeStatusLabel(row.status, 'asset')}</p>
              </Link>
            )) : <p className="py-3 text-sm text-muted-foreground">Sin activos vinculados.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
