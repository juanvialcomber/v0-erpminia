'use client';

import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaintenanceConditionIntelligence } from '@/components/maintenance/maintenance-condition-intelligence';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar inteligencia de lubricación.');
  return payload;
};

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function decimal(value: unknown, suffix = '') {
  const n = number(value);
  return n === null ? 'N/D' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n) + suffix;
}

function money(value: unknown) {
  const n = number(value);
  return n === null ? 'N/D' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function MaintenanceLubricationIntelligence() {
  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/lubrication/intelligence', fetcher, { revalidateOnFocus: false });
  const { data: planData, mutate: mutatePlans } = useSWR('/api/maintenance/lubrication/plans', fetcher, { revalidateOnFocus: false });
  const { data: productsData } = useSWR('/api/maintenance/lubrication/products', fetcher, { revalidateOnFocus: false });
  const condition = useSWR('/api/maintenance/condition-intelligence', fetcher, { revalidateOnFocus: false });
  const [showPlan, setShowPlan] = useState(false);
  const [message, setMessage] = useState('');
  const summary = data?.summary;
  const equipment = data?.equipment || [];
  const warehouse = data?.warehousePlanning || [];
  const schedules = planData?.schedules || [];
  const products = productsData?.rows || [];
  const forecastRangeByProduct = new Map((condition.data?.forecastEvidence || []).map((row:any) => [row.productId, row]));

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productKey = String(form.get('product') || '');
    const [productId] = productKey.split('|');
    setMessage('');
    const response = await fetch('/api/maintenance/lubrication/plans', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preventive_schedule_id: form.get('schedule'),
        canonical_product_id: productId || null,
        fluid_name: form.get('fluid_name') || null,
        planned_input_liters: Number(form.get('planned_input_liters')),
        planned_waste_liters: form.get('planned_waste_liters') ? Number(form.get('planned_waste_liters')) : null,
        liters_per_inventory_unit: form.get('liters_per_inventory_unit') ? Number(form.get('liters_per_inventory_unit')) : null,
        source_reference: form.get('source_reference') || null,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || 'No se pudo guardar el plan.');
      return;
    }
    setMessage('Plan de fluidos guardado.');
    setShowPlan(false);
    await Promise.all([mutate(), mutatePlans()]);
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Ariel · planificación</p>
          <h2 className="mt-1 text-lg font-semibold">Lubricación y proyección</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Consumo, costo, residuos, horas de operación y preparación de Bodega con cobertura explícita.</p>
        </div>
        {planData?.canEdit ? <Button type="button" variant="outline" size="sm" disabled={schedules.length === 0} onClick={() => setShowPlan((value) => !value)}>Configurar plan</Button> : null}
      </div>

      {showPlan && schedules.length > 0 ? (
        <form onSubmit={savePlan} className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Plan preventivo</Label><select name="schedule" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Seleccionar</option>{schedules.map((s:any) => <option key={s.id} value={s.id}>{s.task_name}</option>)}</select></div>
            <div className="space-y-2"><Label>Lubricante Bodega</Label><select name="product" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Otro</option>{products.map((p:any) => <option key={(p.product_id || '') + '|' + (p.warehouse_code || '')} value={(p.product_id || '') + '|' + (p.warehouse_code || '')}>{p.product_code ? p.product_code + ' · ' : ''}{p.product_name}</option>)}</select></div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2"><Label>Nombre manual</Label><Input name="fluid_name" /></div>
            <div className="space-y-2"><Label>Litros por mantención</Label><Input name="planned_input_liters" type="number" min="0.001" step="0.001" required /></div>
            <div className="space-y-2"><Label>Residuo esperado L</Label><Input name="planned_waste_liters" type="number" min="0" step="0.001" /></div>
            <div className="space-y-2"><Label>Litros por unidad Bodega</Label><Input name="liters_per_inventory_unit" type="number" min="0.001" step="0.001" /></div>
          </div>
          <div className="space-y-2"><Label>Fuente / referencia</Label><Input name="source_reference" placeholder="Manual, ficha técnica o criterio aprobado" /></div>
          <div className="flex gap-2"><Button type="submit">Guardar plan</Button><Button type="button" variant="ghost" onClick={() => setShowPlan(false)}>Cancelar</Button></div>
        </form>
      ) : null}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Calculando indicadores…</p> : null}
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
            {[
              ['Stock lubricantes', money(summary?.lubricantStockValueClp)],
              ['Litros identificados', decimal(summary?.lubricantStockLitersKnown, ' L')],
              ['Proyección 30d', decimal(summary?.projectedInputLiters30d, ' L')],
              ['Residuos 30d', decimal(summary?.projectedWasteLiters30d, ' L')],
            ].map(([label,value]) => <div key={label} className="bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
          </div>

          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">Cobertura de cálculo</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">Horómetros utilizables {summary?.runtimeCoverage?.usable || 0}/{summary?.runtimeCoverage?.total || 0}</Badge>
              <Badge variant="outline">Planes preventivos {summary?.preventiveSchedules || 0}</Badge>
              <Badge variant="outline">Planes de fluidos {summary?.fluidPlans || 0}</Badge>
            </div>
            {(summary?.preventiveSchedules || 0) === 0 ? <p className="mt-2 text-muted-foreground">Proyección por mantención: N/D hasta contar con planes preventivos canónicos.</p> : null}
          </div>

          <MaintenanceConditionIntelligence shared={{ data: condition.data, error: condition.error, isLoading: condition.isLoading, mutate: condition.mutate }} />

          <div>
            <h3 className="text-sm font-semibold">Por equipo</h3>
            {equipment.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aún no hay uso de fluidos ni residuos suficientes para comparar por equipo.</p> : (
              <div className="mt-2 overflow-hidden rounded-lg border">
                {equipment.slice(0, 30).map((row:any) => (
                  <div key={row.assetId} className="grid gap-2 border-b p-3 last:border-0 md:grid-cols-[1.3fr_0.7fr_0.7fr_0.7fr_0.8fr]">
                    <div><p className="font-medium">{row.assetName || row.assetCode || 'Equipo'}</p><p className="text-xs text-muted-foreground">{row.assetCode || ''}{row.site ? ' · ' + row.site : ''}</p></div>
                    <div><p className="text-xs text-muted-foreground">Entrada</p><p>{decimal(row.inputLiters,' L')}</p></div>
                    <div><p className="text-xs text-muted-foreground">Residuo</p><p>{decimal(row.wasteLiters,' L')}</p></div>
                    <div><p className="text-xs text-muted-foreground">Consumo/h</p><p>{decimal(row.litersPerHour,' L/h')}</p></div>
                    <div><p className="text-xs text-muted-foreground">Costo</p><p>{money(row.costClp)}</p>{row.reviewState === 'review_required' ? <Badge variant="destructive">Revisar diferencia</Badge> : null}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold">Bodega</h3>
            {warehouse.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Sin demanda proyectable todavía. La existencia de lubricantes sí está conectada; falta parametrizar planes preventivos/fluidos.</p> : (
              <div className="mt-2 overflow-hidden rounded-lg border">
                {warehouse.map((row:any) => {
                  const range:any = forecastRangeByProduct.get(row.productId);
                  const low = range?.empiricalRangeReady ? row.demand30Liters * range.lowFactor : null;
                  const high = range?.empiricalRangeReady ? row.demand30Liters * range.highFactor : null;
                  return (
                  <div key={row.productId} className="grid gap-2 border-b p-3 last:border-0 md:grid-cols-[1.5fr_0.7fr_0.9fr_0.7fr]">
                    <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.warehouses?.join(', ') || 'Bodega'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Disponible</p><p>{decimal(row.stockLiters,' L')}</p></div>
                    <div><p className="text-xs text-muted-foreground">Necesidad 30d</p><p>{decimal(row.demand30Liters,' L')}</p>{low !== null && high !== null ? <p className="text-xs text-muted-foreground">Rango {decimal(low,' L')}–{decimal(high,' L')}</p> : <p className="text-xs text-muted-foreground">Rango N/D · falta historia</p>}</div>
                    <div><p className="text-xs text-muted-foreground">Brecha</p><p>{decimal(row.gap30Liters,' L')}</p><Badge variant={row.state === 'shortage_risk' ? 'destructive' : 'outline'}>{row.state === 'needs_conversion' ? 'Falta conversión' : row.state === 'shortage_risk' ? 'Riesgo stock' : 'Cubierto'}</Badge></div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Fórmulas y límites</summary><div className="mt-2 space-y-1"><p>L/h = litros reales / horas observadas utilizables.</p><p>Costo/h = costo trazable / horas observadas utilizables.</p><p>Proyección por días = período / frecuencia × litros por evento.</p><p>Proyección por horas usa la tasa observada sólo cuando el horómetro es apto para métricas.</p><p>“Revisar diferencia” no significa falla mecánica: señala una inconsistencia operacional a investigar.</p></div></details>
        </>
      ) : null}
    </section>
  );
}
