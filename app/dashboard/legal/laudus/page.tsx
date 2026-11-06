'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, CircleDollarSign, Link2, Truck, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type ContractBridgeItem = {
  id: string;
  contract_number: string | null;
  title: string | null;
  contractor_name: string | null;
  contract_value: number;
  contract_paid_amount: number;
  currency: string;
  status: string | null;
  supplier: { id: string; name: string | null; rut: string | null } | null;
  laudus: {
    external_id: string;
    name: string | null;
    reconciliation_status: string | null;
    synced_at: string | null;
    invoice_count: number;
    invoiced_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    payment_count: number;
    last_payment_at: string | null;
    payment_statuses: string[];
  } | null;
  attribution: {
    level: 'supplier' | 'unresolved';
    exact_contract_payment: boolean;
    reason: string;
  };
};

type ReconciliationItem = {
  contract_number: string;
  contract_title: string | null;
  contractor_name: string | null;
  purchase_order_number: string;
  status: 'pending' | 'verified' | 'conflict' | 'not_found';
  reason: string;
  provenance: {
    source_file: string;
    source_file_sha256: string;
    source_sheet: string;
    source_cell: string;
    source_text: string;
  };
};

type ReconciliationPayload = {
  data: ReconciliationItem[];
  summary: {
    total: number;
    verified: number;
    pending: number;
    conflicts: number;
    not_found: number;
    contracts_covered: number;
  };
  policy: {
    promotion: string;
    no_inference: string;
    payment_link: string;
  };
};

type Payload = {
  data: ContractBridgeItem[];
  summary: {
    contracts: number;
    contracts_with_supplier: number;
    contracts_with_laudus_supplier: number;
    contracts_without_laudus_supplier: number;
    supplier_level_paid_amount: number;
    supplier_level_outstanding_amount: number;
    transport_settlements: number;
    transport_latest_period_end: string | null;
    transport_latest_updated_at: string | null;
  };
  migration: {
    can_move_now: string[];
    needs_binding: string[];
    stays_laudus_canonical: string[];
  };
  policy: {
    source: string;
    warning: string;
  };
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la evidencia financiera');
  return payload as T;
};

const fetchBridge = (url: string) => fetchJson<Payload>(url);
const fetchReconciliation = (url: string) => fetchJson<ReconciliationPayload>(url);

function money(value: number, currency = 'CLP') {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function date(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value));
}

export default function LegalLaudusPage() {
  const { data, error, isLoading } = useSWR<Payload>('/api/legal/laudus-bridge', fetchBridge, {
    revalidateOnFocus: false,
  });
  const { data: reconciliation, error: reconciliationError } = useSWR<ReconciliationPayload>(
    '/api/legal/contract-po-reconciliation',
    fetchReconciliation,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return <StatePanel tone="loading" title="Revisando interacción con Laudus" description="Conciliando contratos, proveedores, facturas, pagos y liquidaciones." />;
  }

  if (error || !data) {
    return <StatePanel tone="error" title="Interacción Laudus no disponible" description="MOTIL no sustituye montos ni estados cuando la evidencia financiera no está disponible." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button asChild size="sm" variant="ghost"><Link href="/dashboard/legal"><ArrowLeft className="mr-2 h-4 w-4" />Legal</Link></Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/avances-pagos">Avances y pagos <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/control-contractual">Control contractual <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </div>

      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Finanzas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Legal ↔ Laudus</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Qué información financiera ya puede consultar Legal desde MOTIL y qué todavía requiere vincular OC o factura para ser exacta por contrato.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-4">
        {[
          ['Contratos', data.summary.contracts],
          ['Proveedor conciliado', data.summary.contracts_with_laudus_supplier],
          ['Pendientes de enlace', data.summary.contracts_without_laudus_supplier],
          ['Liquidaciones transporte', data.summary.transport_settlements],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-md border p-4">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">Puede salir de Laudus ahora</h2>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {data.migration.can_move_now.map((item) => <p key={item}>• {item}</p>)}
          </div>
        </article>
        <article className="rounded-md border p-4">
          <Unplug className="h-4 w-4 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">Falta enlace exacto</h2>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {data.migration.needs_binding.map((item) => <p key={item}>• {item}</p>)}
          </div>
        </article>
        <article className="rounded-md border p-4">
          <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">Sigue siendo autoridad Laudus</h2>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            {data.migration.stays_laudus_canonical.map((item) => <p key={item}>• {item}</p>)}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-md border">
        <div className="border-b bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold">Conciliación Contrato ↔ OC</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Candidatos extraídos de la planilla de Legal. Una OC sólo queda verificada cuando existe en la fuente canónica y el proveedor es compatible.
          </p>
        </div>
        {reconciliationError ? (
          <p className="p-4 text-sm text-destructive">No se pudo actualizar la conciliación de órdenes de compra.</p>
        ) : !reconciliation ? (
          <p className="p-4 text-sm text-muted-foreground">Revisando órdenes de compra…</p>
        ) : (
          <>
            <div className="grid border-b sm:grid-cols-5">
              {[
                ['Candidatas', reconciliation.summary.total],
                ['Verificadas', reconciliation.summary.verified],
                ['Pendientes', reconciliation.summary.pending],
                ['Conflictos', reconciliation.summary.conflicts],
                ['No encontradas', reconciliation.summary.not_found],
              ].map(([label, value], index) => (
                <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="divide-y">
              {reconciliation.data.map((item) => (
                <div key={`${item.contract_number}-${item.purchase_order_number}`} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.contract_number}</Badge>
                      <span className="text-sm font-medium">OC {item.purchase_order_number}</span>
                      <Badge variant={item.status === 'verified' ? 'secondary' : item.status === 'conflict' ? 'destructive' : 'outline'}>
                        {item.status === 'verified' ? 'Verificada' : item.status === 'conflict' ? 'Conflicto' : item.status === 'not_found' ? 'No encontrada' : 'Pendiente'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.contract_title || item.contractor_name || 'Contrato'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground md:text-right">
                    <p>{item.provenance.source_sheet} · {item.provenance.source_cell}</p>
                    <p className="mt-1">Fuente: {item.provenance.source_file}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">{reconciliation.policy.payment_link}</p>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-md border">
        <div className="border-b bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold">Contratos y evidencia financiera</h2>
          <p className="mt-1 text-xs text-muted-foreground">{data.policy.warning}</p>
        </div>
        <div className="divide-y">
          {data.data.map((item) => (
            <article key={item.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.contract_number || 'Sin número'}</Badge>
                    <Badge variant={item.laudus ? 'secondary' : 'destructive'}>
                      {item.laudus ? 'Proveedor Laudus conciliado' : 'Sin enlace Laudus'}
                    </Badge>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold">{item.title || item.contractor_name || 'Contrato'}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.supplier ? `${item.supplier.name || item.contractor_name || 'Proveedor'} · ${item.supplier.rut || 'RUT no informado'}` : 'Proveedor MOTIL no enlazado'}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground lg:text-right">
                  <p>Contrato: {money(item.contract_value, item.currency)}</p>
                  <p className="mt-1">Pagado contractual: {money(item.contract_paid_amount, item.currency)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 border-t pt-3 text-xs md:grid-cols-5">
                <p><span className="font-medium text-foreground">Facturas Laudus</span><br />{item.laudus?.invoice_count ?? '—'}</p>
                <p><span className="font-medium text-foreground">Facturado proveedor</span><br />{item.laudus ? money(item.laudus.invoiced_amount, item.currency) : '—'}</p>
                <p><span className="font-medium text-foreground">Pagado proveedor</span><br />{item.laudus ? money(item.laudus.paid_amount, item.currency) : '—'}</p>
                <p><span className="font-medium text-foreground">Pendiente proveedor</span><br />{item.laudus ? money(item.laudus.outstanding_amount, item.currency) : '—'}</p>
                <p><span className="font-medium text-foreground">Último pago</span><br />{date(item.laudus?.last_payment_at || null)}</p>
              </div>

              <div className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Exactitud: </span>{item.attribution.reason}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Liquidaciones de transportistas</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.summary.transport_settlements} liquidaciones ya están en MOTIL. Último período: {data.summary.transport_latest_period_end || '—'}.
          </p>
        </div>
        <Badge variant="secondary">Ya fuera de Excel/Laudus para consulta</Badge>
      </section>
    </div>
  );
}
