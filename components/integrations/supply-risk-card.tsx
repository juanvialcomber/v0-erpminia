'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, PackageSearch, ShieldCheck, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type SupplyRiskRow = {
  product_id: string;
  product_code: string;
  name: string;
  family: string | null;
  risk_score: number;
  risk_reasons: string[];
  quantity_available: number;
  minimum_required: number;
  active_required_qty: number;
  active_shortage_qty: number;
  active_work_orders: number;
  affected_assets: number;
  supplier_count: number;
  top_supplier_share: number | null;
  purchase_lines: number;
  latest_unit_price: number | null;
  median_unit_price: number | null;
  price_ratio: number | null;
  laudus_matched: boolean;
};

type Payload = {
  scope_days: number;
  summary: {
    total_products: number;
    laudus_matched_products: number;
    below_minimum: number;
    zero_stock_below_minimum: number;
    active_maintenance_shortages: number;
    single_supplier_products: number;
    price_outliers_20pct: number;
    high_risk: number;
    medium_risk: number;
  };
  coverage: { laudus_sku_match_rate: number };
  top_actions: SupplyRiskRow[];
  pending: SupplyRiskRow[];
  decisionMetrics: {
    reviewed: number;
    actionRequired: number;
    notApplicable: number;
    total: number;
    actionRate: number | null;
  };
  policy: 'read_only_explainable';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular el riesgo de abastecimiento.');
  return payload;
};

const n = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(value)
    : '—';

const money = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
    : '—';

const reasonLabel: Record<string, string> = {
  active_maintenance_shortage: 'OT sin cobertura',
  critical_work_order: 'OT crítica',
  zero_stock: 'Sin stock',
  below_minimum: 'Bajo mínimo',
  single_supplier: 'Proveedor único',
  supplier_concentration: 'Proveedor concentrado',
  price_above_20pct: 'Precio +20%',
  price_above_50pct: 'Precio +50%',
};

export function SupplyRiskCard() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/procurement/supply-risk?days=365',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 300000 },
  );

  const [actionMode, setActionMode] = useState<'action_required' | 'not_applicable' | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (error) return null;

  const current = data?.pending?.[0];

  const decide = async (decision: 'reviewed' | 'action_required' | 'not_applicable') => {
    if (!current) return;
    if (decision === 'action_required' && !reasonCode) {
      setMessage('Selecciona la acción requerida.');
      return;
    }
    if (decision === 'not_applicable' && note.trim().length < 3) {
      setMessage('Indica brevemente por qué no aplica.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/procurement/supply-risk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: current.product_id,
          decision,
          reasonCode,
          note: note.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la decisión.');
      setActionMode(null);
      setReasonCode('');
      setNote('');
      setMessage(payload?.message || 'Decisión registrada.');
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar la decisión.');
    } finally {
      setSaving(false);
    }
  };

  const actionReasons = [
    ['request_quote','Pedir cotización'],
    ['diversify_supplier','Buscar alternativa'],
    ['validate_price','Validar precio'],
    ['replenish_stock','Reponer stock'],
    ['check_inventory','Revisar inventario'],
    ['maintenance_followup','Revisar mantención'],
    ['other','Otra acción'],
  ] as const;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Riesgo de abastecimiento</h2>
            <Badge variant="outline">Lectura</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Cruza stock actual, mínimos, compras Laudus, concentración de proveedor, precio y requerimientos de OT activas. Una señal preventiva no equivale a una compra aprobada.
          </p>
        </div>
        {!isLoading && data ? (
          <Badge variant="outline">
            Laudus enlazado {Math.round(data.coverage.laudus_sku_match_rate * 100)}%
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(data?.summary.zero_stock_below_minimum)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Sin stock y bajo mínimo</p>
        </div>
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(data?.summary.active_maintenance_shortages)}</p>
          <p className="mt-1 text-xs text-muted-foreground">OT activas con falta de material</p>
        </div>
        <div className="bg-card p-4">
          <PackageSearch className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(data?.summary.single_supplier_products)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Productos con proveedor único</p>
        </div>
        <div className="bg-card p-4">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(data?.summary.price_outliers_20pct)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Precios ≥20% sobre referencia</p>
        </div>
      </div>

      {!isLoading && current ? (
        <div className="border-t p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Decisión siguiente</p>
              <p className="mt-1 truncate text-sm font-semibold">{current.product_code} · {current.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {current.risk_reasons.map((reason) => <Badge key={reason} variant="outline">{reasonLabel[reason] || reason}</Badge>)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Riesgo {current.risk_score}/100 · stock {n(current.quantity_available)} · mínimo {n(current.minimum_required)}
                {current.active_work_orders > 0 ? ` · ${current.active_work_orders} OT activa(s)` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={saving} onClick={() => void decide('reviewed')}>Revisar</Button>
              <Button size="sm" disabled={saving} onClick={() => setActionMode('action_required')}>Actuar</Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setActionMode('not_applicable')}>No aplica</Button>
            </div>
          </div>

          {actionMode === 'action_required' ? (
            <div className="mt-4 rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-medium">Qué acción corresponde</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {actionReasons.map(([code,label]) => (
                  <Button key={code} size="sm" type="button" variant={reasonCode === code ? 'secondary' : 'outline'} onClick={() => setReasonCode(code)}>
                    {label}
                  </Button>
                ))}
              </div>
              <Textarea className="mt-3 min-h-16" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional para seguimiento…" />
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={saving || !reasonCode} onClick={() => void decide('action_required')}>Registrar acción</Button>
                <Button size="sm" variant="ghost" onClick={() => { setActionMode(null); setReasonCode(''); setNote(''); }}>Cancelar</Button>
              </div>
            </div>
          ) : null}

          {actionMode === 'not_applicable' ? (
            <div className="mt-4 rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-medium">Por qué no aplica</p>
              <Textarea className="mt-2 min-h-16" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: precio corresponde a otra unidad; stock ya fue corregido…" />
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" disabled={saving || note.trim().length < 3} onClick={() => void decide('not_applicable')}>Descartar señal</Button>
                <Button size="sm" variant="ghost" onClick={() => { setActionMode(null); setNote(''); }}>Cancelar</Button>
              </div>
            </div>
          ) : null}

          {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}

      {!isLoading && data?.top_actions?.length ? (
        <div className="border-t">
          <div className="px-4 py-3">
            <p className="text-sm font-medium">Qué revisar primero</p>
            <p className="text-xs text-muted-foreground">
              Priorización explicable. Precio es señal de revisión; puede reflejar unidad, especificación o condición distinta.
            </p>
          </div>
          <div className="divide-y">
            {data.top_actions.slice(0, 6).map((item) => (
              <div key={item.product_id} className="grid gap-2 px-4 py-3 lg:grid-cols-[1fr_160px_160px] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.product_code} · {item.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.risk_reasons.map((reason) => (
                      <Badge key={reason} variant="outline">{reasonLabel[reason] || reason}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Stock {n(item.quantity_available)} · mínimo {n(item.minimum_required)}</p>
                  <p>{item.supplier_count > 0 ? item.supplier_count + ' proveedor(es)' : 'Proveedor no medido en Laudus'}</p>
                </div>
                <div className="text-xs text-muted-foreground lg:text-right">
                  <p>Riesgo {item.risk_score}/100</p>
                  <p>
                    {item.price_ratio && item.price_ratio >= 1.2
                      ? money(item.latest_unit_price) + ' vs ' + money(item.median_unit_price)
                      : item.active_work_orders > 0
                        ? item.active_work_orders + ' OT activa(s)'
                        : 'Sin OT activa vinculada'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && data ? (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {n(data.summary.high_risk)} señales altas · {n(data.summary.medium_risk)} medias · {n(data.summary.below_minimum)} productos bajo mínimo.
          {data.decisionMetrics.total > 0 ? ` · ${n(data.decisionMetrics.actionRequired)} acciones requeridas de ${n(data.decisionMetrics.total)} decisiones.` : ''}
          La cobertura Laudus se informa aparte para no confundir falta de enlace con falta de proveedor.
        </div>
      ) : null}
    </section>
  );
}
