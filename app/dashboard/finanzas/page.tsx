'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CircleDollarSign, TriangleAlert } from 'lucide-react';
import { useModuleAccess } from '@/hooks/use-module-access';

type Row = Record<string, string | number | null>;

type LaudusReviewItem = {
  purchase_invoice_external_id?: string;
  doc_number?: string | null;
  supplier_name?: string | null;
  due_date?: string | null;
  outstanding_amount?: number | null;
  currency?: string | null;
  days_overdue?: number | null;
  review_reason?: string | null;
};

type LaudusReview = {
  source?: string;
  read_only?: boolean;
  summary?: {
    invoice_count?: number;
    open_count?: number;
    open_amount?: number;
    overdue_count?: number;
    overdue_amount?: number;
    no_due_date_count?: number;
  };
  reviews?: LaudusReviewItem[];
};

type Response = {
  overview?: Row | null;
  topAssets?: Row[];
  topProducts?: Row[];
  topSuppliers?: Row[];
  topCostCenters?: Row[];
  validation?: Row | null;
  treasury?: Row[];
  treasuryAging?: Row[];
  cashForecast?: Row[];
  laudusReview?: LaudusReview | null;
};

type ConcentrationKey = 'assets' | 'products' | 'suppliers' | 'costCenters';

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Finanzas');
  return payload;
};

const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const money = (value: unknown) =>
  amount(value) === null
    ? '—'
    : new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(amount(value)!);

const currencyMoney = (value: unknown, currency: unknown) => {
  const numeric = amount(value);
  if (numeric === null) return '—';
  const code =
    typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)
      ? currency.toUpperCase()
      : 'CLP';
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${code} ${new Intl.NumberFormat('es-CL').format(numeric)}`;
  }
};

const number = (value: unknown) =>
  amount(value) === null ? '—' : new Intl.NumberFormat('es-CL').format(amount(value)!);

const concentrationConfig: Record<
  ConcentrationKey,
  { label: string; labelKey: string; amountKey: string }
> = {
  assets: { label: 'Activos', labelKey: 'asset_name', amountKey: 'recognized_clp' },
  products: { label: 'Productos', labelKey: 'product_name', amountKey: 'committed_clp' },
  suppliers: { label: 'Proveedores', labelKey: 'supplier_name', amountKey: 'committed_clp' },
  costCenters: { label: 'Centros de costo', labelKey: 'cost_center_code', amountKey: 'committed_clp' },
};

export default function FinanzasPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/executive', fetcher, {
    refreshInterval: 15 * 60 * 1000,
  });
  const { canEdit, ready } = useModuleAccess();
  const [activeConcentration, setActiveConcentration] = useState<ConcentrationKey>('assets');

  const overview = error ? {} : data?.overview || {};
  const treasury = error ? [] : data?.treasury || [];
  const laudus = error ? null : data?.laudusReview || null;
  const laudusSummary = laudus?.summary || {};
  const attention = (laudus?.reviews || []).slice(0, 5);

  const motilOutstanding = treasury.reduce(
    (sum, row) => sum + Number(row.outstanding_amount || 0),
    0,
  );
  const motilDueSoon = treasury.reduce(
    (sum, row) => sum + Number(row.due_soon_amount || 0),
    0,
  );
  const motilOverdue = treasury.reduce(
    (sum, row) => sum + Number(row.overdue_amount || 0),
    0,
  );

  const rowsByType: Record<ConcentrationKey, Row[]> = error
    ? { assets: [], products: [], suppliers: [], costCenters: [] }
    : {
        assets: data?.topAssets || [],
        products: data?.topProducts || [],
        suppliers: data?.topSuppliers || [],
        costCenters: data?.topCostCenters || [],
      };
  const config = concentrationConfig[activeConcentration];
  const rows = rowsByType[activeConcentration].slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Finanzas
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Qué requiere atención</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Obligaciones, caja y concentración. Laudus aporta evidencia; MOTIL ordena la revisión y mantiene la decisión humana.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/valor"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Valor MOTIL
          </Link>
          <Link
            href="/dashboard/finanzas/trazabilidad"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Trazabilidad <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            'Exposición Laudus',
            money(laudusSummary.open_amount),
            `${number(laudusSummary.open_count)} obligaciones abiertas`,
          ],
          [
            'Vencido en Laudus',
            money(laudusSummary.overdue_amount),
            `${number(laudusSummary.overdue_count)} documentos`,
          ],
          ['Costo reconocido MOTIL', money(overview.recognized_clp), 'Hechos operacionales reconocidos'],
          ['Compras comprometidas', money(overview.committed_clp), 'Compromisos operacionales'],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {isLoading || error ? '—' : value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Revisar primero</h2>
            <p className="text-sm text-muted-foreground">
              Mayores excepciones abiertas de Laudus, ordenadas por vencimiento y monto.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Fuente de solo lectura</span>
        </div>
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Cargando prioridades…</p>
        ) : attention.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No hay obligaciones Laudus abiertas disponibles para priorizar.
          </p>
        ) : (
          <div>
            {attention.map((item, index) => (
              <div
                key={item.purchase_invoice_external_id || `${item.doc_number}-${index}`}
                className="grid gap-2 border-b px-5 py-4 last:border-b-0 md:grid-cols-[28px_minmax(0,1fr)_150px_140px] md:items-center"
              >
                <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.supplier_name || 'Proveedor sin identificar'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.doc_number ? `Doc. ${item.doc_number} · ` : ''}
                    {item.review_reason || 'Revisión requerida'}
                    {Number(item.days_overdue || 0) > 0 ? ` · ${number(item.days_overdue)} días` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground md:text-right">
                  {item.due_date ? `Vence ${item.due_date}` : 'Sin vencimiento'}
                </span>
                <span className="text-sm font-semibold tabular-nums md:text-right">
                  {currencyMoney(item.outstanding_amount, item.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border p-5">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">CxP aprobadas en MOTIL</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Este universo es distinto de la exposición histórica observada en Laudus.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className="mt-1 text-xl font-semibold">{money(motilOutstanding)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vence ≤ 7 días</p>
              <p className="mt-1 text-xl font-semibold">{money(motilDueSoon)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vencido</p>
              <p className="mt-1 text-xl font-semibold">{money(motilOverdue)}</p>
            </div>
          </div>
          {ready && canEdit('fin_finanzas') ? (
            <Link
              href="/dashboard/finanzas/pagos"
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Operar pagos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <div className="rounded-lg border p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Dónde se concentra</h2>
              <p className="text-xs text-muted-foreground">Top 5 del contexto financiero canónico.</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(concentrationConfig) as ConcentrationKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveConcentration(key)}
                  className={`rounded-md px-2.5 py-1 text-xs ${activeConcentration === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  {concentrationConfig[key].label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            {!isLoading && !error && rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Sin datos canónicos vinculados.</p>
            ) : (
              rows.map((row, index) => (
                <div
                  key={`${String(row[config.labelKey])}-${index}`}
                  className="grid grid-cols-[24px_minmax(0,1fr)_130px] items-center gap-2 border-b py-2.5 last:border-b-0"
                >
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <span className="truncate text-sm">{String(row[config.labelKey] || 'Sin identificar')}</span>
                  <span className="text-sm font-semibold tabular-nums text-right">
                    {money(row[config.amountKey])}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {Number(laudusSummary.no_due_date_count || 0) > 0 ? (
        <section className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {number(laudusSummary.no_due_date_count)} obligaciones Laudus no tienen vencimiento.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              MOTIL las mantiene visibles como excepción; no inventa una fecha.
            </p>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
        <Link href="/dashboard/finanzas/fuentes" className="hover:text-foreground">Fuentes y calidad</Link>
        <Link href="/dashboard/finanzas/documentos" className="hover:text-foreground">Documentos</Link>
        <Link href="/dashboard/legal" className="hover:text-foreground">Evidencia legal</Link>
        <Link href="/dashboard/finanzas/calendario" className="hover:text-foreground">Calendario</Link>
      </section>
    </div>
  );
}
