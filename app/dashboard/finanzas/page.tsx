'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { FileSearch } from 'lucide-react';
import { useModuleAccess } from '@/hooks/use-module-access';
import { DataSourceStatusStrip } from '@/components/data/data-source-status-strip';
import { DataReceptionReadiness } from '@/components/data/data-reception-readiness';
import { useDataSourceStatus } from '@/hooks/use-data-source-status';
import { LaudusFinanceReadinessCard } from '@/components/integrations/laudus-finance-readiness-card';
import { LaudusAccountingReadinessCard } from '@/components/integrations/laudus-accounting-readiness-card';

type Row = Record<string, string | number | null>;
type Response = { overview?: Row | null; topAssets?: Row[]; topProducts?: Row[]; topSuppliers?: Row[]; topCostCenters?: Row[]; validation?: Row | null; recentEvents?: Row[]; operationalProcurement?: Row | null; operationalProcurementEvents?: Row[]; treasury?: Row[]; treasuryAging?: Row[]; cashForecast?: Row[] };
type ConcentrationKey = 'assets' | 'products' | 'suppliers' | 'costCenters';

const fetcher = async (url: string): Promise<Response> => { const response = await fetch(url, { credentials: 'include' }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Finanzas'); return payload; };
const amount = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const money = (value: unknown) => amount(value) === null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount(value)!);
const currencyMoney = (value: unknown, currency: unknown) => { const numeric = amount(value); if (numeric === null) return '—'; const code = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null; if (!code) return '—'; try { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(numeric); } catch { return `${code} ${new Intl.NumberFormat('es-CL').format(numeric)}`; } };
const number = (value: unknown) => amount(value) === null ? '—' : new Intl.NumberFormat('es-CL').format(amount(value)!);

const concentrationConfig: Record<ConcentrationKey, { label: string; labelKey: string; amountKey: string }> = {
  assets: { label: 'Activos', labelKey: 'asset_name', amountKey: 'recognized_clp' },
  products: { label: 'Productos', labelKey: 'product_name', amountKey: 'committed_clp' },
  suppliers: { label: 'Proveedores', labelKey: 'supplier_name', amountKey: 'committed_clp' },
  costCenters: { label: 'Centros de costo', labelKey: 'cost_center_code', amountKey: 'committed_clp' },
};

const agingLabels: Record<string, string> = { no_due_date: 'Sin vencimiento', current: 'Al día', overdue_1_30: '1–30 días vencido', overdue_31_60: '31–60 días vencido', overdue_61_90: '61–90 días vencido', overdue_90_plus: '90+ días vencido' };

export default function FinanzasPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/executive', fetcher);
  const { canEdit, ready } = useModuleAccess();
  const [activeConcentration, setActiveConcentration] = useState<ConcentrationKey>('assets');
  const sourceStatus = useDataSourceStatus();
  const overview = error ? {} : data?.overview || {};
  const operationalProcurement = error ? {} : data?.operationalProcurement || {};
  const treasury = error ? [] : data?.treasury || [];
  const treasuryAging = error ? [] : data?.treasuryAging || [];
  const cashForecast = error ? [] : data?.cashForecast || [];
  const validationStatus = typeof data?.validation?.status === 'string' ? data.validation.status.toLowerCase() : null;
  const rowsByType: Record<ConcentrationKey, Row[]> = error ? { assets: [], products: [], suppliers: [], costCenters: [] } : { assets: data?.topAssets || [], products: data?.topProducts || [], suppliers: data?.topSuppliers || [], costCenters: data?.topCostCenters || [] };
  const config = concentrationConfig[activeConcentration];
  const rows = rowsByType[activeConcentration].slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Link href="/dashboard/finanzas/calendario" className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Calendario del área →</Link></div>
      <section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Finanzas</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Finanzas</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Costo, compromisos y caja en una sola vista, sin mezclar conceptos.</p></div>
        <Link href="/dashboard/finanzas/trazabilidad" className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"><FileSearch className="h-4 w-4"/>Ver trazabilidad</Link>
      </section>

      <DataSourceStatusStrip
        reviewHref="/dashboard/calidad-datos"
        sources={[
          sourceStatus.source('finance', { key: 'finance', label: 'MOTIL Finanzas', state: 'pending', detail: 'Costos, compromisos y trazabilidad operacional.' }),
          sourceStatus.source('procurement', { key: 'procurement', label: 'Compras', state: 'pending', detail: 'OC, recepciones, facturas y cuentas por pagar.' }),
          sourceStatus.source('laudus', { key: 'laudus', label: 'Laudus', state: 'updated', detail: 'ERP financiero conectado; datos disponibles para conciliación y revisión.' }),
          { key: 'legal', label: 'Evidencia legal', state: 'updated', detail: 'Separada de cifras operacionales y financieras.' },
        ]}
      />

      <LaudusFinanceReadinessCard />

      <LaudusAccountingReadinessCard />

      <DataReceptionReadiness
        description="Finanzas está preparada para recibir hechos ERP sin confundirlos con aprobación de pagos ni con decisiones operacionales. Los datos externos entrarán con procedencia y conciliación."
        items={[
          { label: 'Centros de costo', ready: true, detail: 'Dimensión canónica disponible.' },
          { label: 'Compras y CxP', ready: true, detail: 'Vistas operacionales y tesorería disponibles.' },
          { label: 'Trazabilidad', ready: true, detail: 'Eventos y fuentes auditables.' },
          { label: 'Laudus contable', ready: sourceStatus.state('laudus') === 'updated', detail: sourceStatus.state('laudus') === 'updated' ? 'ERP financiero conectado; revisar excepciones y conciliación.' : sourceStatus.state('laudus') === 'review' ? 'Hay datos recibidos que requieren revisión.' : 'Fuente temporalmente sin actualización.' },
        ]}
      />

      {error ? <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error.message}</div> : null}
      <section aria-label="Alcance de control regulatorio minero" className="rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Trazabilidad económica y SERNAGEOMIN</h2>
        <p className="mt-1 text-muted-foreground">Estas cifras son costos, compromisos y caja de operación. No representan la valorización aprobada del plan de cierre ni garantías financieras constituidas. Para evaluar obligaciones de cierre se requieren resolución vigente, medidas por instalación, cronograma, memoria de valorización e instrumentos de garantía verificables.</p>
        <div className="mt-3 flex flex-wrap gap-4"><Link href="/dashboard/legal" className="font-medium text-primary underline-offset-4 hover:underline">Revisar evidencia legal</Link><Link href="/dashboard/centros-costos" className="font-medium text-primary underline-offset-4 hover:underline">Conciliar centros de costo</Link></div>
        <p className="mt-2 text-xs text-muted-foreground">Referencia normativa: Ley 20.551 y DS 41; la aplicación no certifica cumplimiento ante SERNAGEOMIN.</p>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Costo reconocido', money(overview.recognized_clp)],
          ['Compras comprometidas', money(overview.committed_clp)],
          ['Eventos certificados', number(overview.event_count)],
          ['Validación', validationStatus === null ? 'Sin evidencia' : validationStatus === 'passed' ? 'Aprobada' : 'Revisar'],
        ].map(([label, value]) => <div key={label} className="bg-card px-5 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{isLoading || error ? '—' : value}</p></div>)}
      </section>

      <section className="space-y-3 border-t pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Tesorería</h2><p className="text-sm text-muted-foreground">Pagos, vencimientos y conciliación.</p></div>{ready && canEdit('fin_finanzas') ? <Link href="/dashboard/finanzas/pagos" className="text-sm font-medium text-primary hover:underline">Operar pagos</Link> : null}</div>
        {!isLoading && !error && treasury.length === 0 ? <div className="rounded-lg border px-4 py-5 text-sm text-muted-foreground">No hay cuentas por pagar aprobadas.</div> : treasury.map((row) => <div key={String(row.currency)} className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
          {[
            [`Saldo ${String(row.currency || '')}`, currencyMoney(row.outstanding_amount, row.currency)],
            ['Vence ≤ 7 días', `${number(row.due_soon_count)} · ${currencyMoney(row.due_soon_amount, row.currency)}`],
            ['Vencido', `${number(row.overdue_count)} · ${currencyMoney(row.overdue_amount, row.currency)}`],
            ['Sin vencimiento', `${number(row.no_due_date_count)} · ${currencyMoney(row.no_due_date_amount, row.currency)}`],
            ['Sin conciliar', `${number(row.unreconciled_payment_count)} · ${currencyMoney(row.unreconciled_payment_amount, row.currency)}`],
          ].map(([label, value]) => <div key={label} className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold tracking-tight">{value}</p></div>)}
        </div>)}
        {treasuryAging.length > 0 ? <div className="overflow-hidden rounded-lg border"><div className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Aging por proveedor</h3></div>{treasuryAging.slice(0, 8).map((row, index) => <div key={`${String(row.supplier_id)}-${String(row.aging_bucket)}-${index}`} className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_180px_160px]"><span className="truncate text-sm font-medium">{String(row.supplier_name || 'Proveedor')}</span><span className="text-sm text-muted-foreground">{agingLabels[String(row.aging_bucket)] || String(row.aging_bucket)}</span><span className="text-sm font-semibold tabular-nums sm:text-right">{currencyMoney(row.outstanding_amount, row.currency)}</span></div>)}</div> : null}
      </section>

      <section className="space-y-3 border-t pt-5">
        <div><h2 className="text-lg font-semibold">Forecast de caja</h2><p className="text-sm text-muted-foreground">Obligaciones por vencimiento. Las cuentas sin fecha se mantienen fuera del forecast y visibles como excepción.</p></div>
        {!isLoading && !error && cashForecast.length === 0 ? <div className="rounded-lg border px-4 py-5 text-sm text-muted-foreground">No hay obligaciones aprobadas con saldo pendiente para proyectar.</div> : cashForecast.map((row) => <div key={`forecast-${String(row.currency)}`} className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">{String(row.currency || '')}</p><p className="text-xs text-muted-foreground">{number(row.open_payables)} obligación(es) abiertas</p></div><p className="text-sm font-semibold tabular-nums">Saldo {currencyMoney(row.total_outstanding_amount, row.currency)}</p></div>
          <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Vencido', row.overdue_amount],
              ['Próx. 7 días', row.due_next_7_amount],
              ['Próx. 30 días', row.due_next_30_amount],
              ['Próx. 60 días', row.due_next_60_amount],
              ['Próx. 90 días', row.due_next_90_amount],
            ].map(([label, value]) => <div key={label} className="bg-card px-3 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{currencyMoney(value, row.currency)}</p></div>)}
          </div>
          {Number(row.no_due_date_amount || 0) > 0 ? <p className="text-xs text-amber-700 dark:text-amber-400">Fuera del forecast: {number(row.no_due_date_count)} obligación(es) sin vencimiento por {currencyMoney(row.no_due_date_amount, row.currency)}.</p> : null}
          {row.next_due_date ? <p className="text-xs text-muted-foreground">Próximo vencimiento registrado: {String(row.next_due_date)}.</p> : null}
        </div>)}
      </section>

      <section className="space-y-3 border-t pt-5">
        <div><h2 className="text-lg font-semibold">Compras operativas</h2><p className="text-sm text-muted-foreground">Compromiso pendiente y costo ya recepcionado.</p></div>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Compromiso pendiente', money(operationalProcurement.committed_clp)],
            ['Recepcionado', money(operationalProcurement.recognized_clp)],
            ['Eventos sin centro de costo', number(operationalProcurement.missing_cost_center_events)],
            ['Monto sin centro de costo', money(operationalProcurement.missing_cost_center_amount)],
          ].map(([label, value]) => <div key={label} className="bg-card px-5 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{isLoading ? '—' : value}</p></div>)}
        </div>
        {Number(operationalProcurement.missing_cost_center_events || 0) > 0 ? <p className="text-sm text-amber-700 dark:text-amber-400">Hay compras operativas sin centro de costo. Se mantienen visibles como excepción y no se asignan automáticamente.</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Dónde se concentra</h2><p className="text-sm text-muted-foreground">Principales concentraciones por dimensión.</p></div><div className="flex flex-wrap gap-1">{(Object.keys(concentrationConfig) as ConcentrationKey[]).map((key) => <button key={key} type="button" onClick={() => setActiveConcentration(key)} className={`rounded-md px-3 py-1.5 text-sm ${activeConcentration === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{concentrationConfig[key].label}</button>)}</div></div>
        <div className="overflow-hidden rounded-lg border">{!isLoading && !error && rows.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Sin datos canónicos vinculados.</p> : rows.map((row, index) => <div key={`${String(row[config.labelKey])}-${index}`} className="grid gap-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[32px_1fr_180px] md:items-center"><span className="text-sm text-muted-foreground">{index + 1}</span><span className="truncate text-sm font-medium">{String(row[config.labelKey] || 'Sin identificar')}</span><span className="text-sm font-semibold tabular-nums md:text-right">{money(row[config.amountKey])}</span></div>)}</div>
      </section>

      {(data?.recentEvents || []).length ? <section className="border-t pt-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Últimos registros auditados</h2><p className="text-xs text-muted-foreground">Origen y monto conservados para revisión.</p></div><Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard/finanzas/trazabilidad">Ver todos</Link></div></section> : null}
    </div>
  );
}
