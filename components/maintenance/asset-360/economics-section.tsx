// Sección "Economía" de la ficha 360 operacional.
// Extraída de asset-360-overview.tsx; consume las primitivas y helpers
// compartidos del mismo directorio.

import { CalendarDays, ChevronDown, Coins, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { date, money, number } from './format';
import { IdentityItem } from './primitives';
import type { Asset360OperationalState } from './availability-section';

export type Asset360EconomicHistoryRow = {
  fiscal_year?: number | null;
  movement_count?: number | string | null;
  historical_total_cost?: number | string | null;
  first_cost_date?: string | null;
  last_cost_date?: string | null;
};

export function Asset360EconomicsSection({
  economicHistory,
  operationalState,
  lastCostEventAt,
  financeProfile,
}: {
  economicHistory: Asset360EconomicHistoryRow[];
  operationalState: Asset360OperationalState | undefined;
  lastCostEventAt: string | null | undefined;
  financeProfile?: {
    insurance?: {
      insured_uf?: number | string | null;
      source_file?: string | null;
      source_cutoff_date?: string | null;
      canonical?: boolean;
      authority?: string | null;
    } | null;
    depreciation?: {
      net_book_value?: number | string | null;
      updated_asset?: number | string | null;
      total_accum_depr?: number | string | null;
      depreciation_current?: number | string | null;
      remaining_life_months?: number | string | null;
      source_file?: string | null;
      source_cutoff_date?: string | null;
      canonical?: boolean;
      authority?: string | null;
      review_flags?: unknown[];
    } | null;
    depreciation_identity_pending?: boolean;
    depreciation_conflict_count?: number;
  };
}) {
  const economicLifetime = economicHistory.reduce(
    (sum, row) => sum + Number(row.historical_total_cost || 0),
    0,
  );
  const economicMovementCount = economicHistory.reduce(
    (sum, row) => sum + Number(row.movement_count || 0),
    0,
  );
  const economicYearsWithMovements = economicHistory.filter(
    (row) => Number(row.movement_count || 0) > 0 || Number(row.historical_total_cost || 0) !== 0,
  ).length;
  const economicAnnualAverage =
    economicYearsWithMovements > 0 ? economicLifetime / economicYearsWithMovements : null;
  const economicFirstCostDate = economicHistory.length > 0
    ? economicHistory[economicHistory.length - 1]?.first_cost_date
    : null;
  const economicLastCostDate =
    economicHistory[0]?.last_cost_date ||
    lastCostEventAt ||
    operationalState?.last_cost_at ||
    null;
  const economicLifetimeValue = operationalState?.recognized_cost_clp_lifetime != null
    ? Number(operationalState.recognized_cost_clp_lifetime)
    : economicHistory.length > 0
      ? economicLifetime
      : null;
  const economicYtdValue = operationalState?.recognized_cost_clp_ytd != null
    ? Number(operationalState.recognized_cost_clp_ytd)
    : null;
  const economic12mValue = operationalState?.recognized_cost_clp_12m != null
    ? Number(operationalState.recognized_cost_clp_12m)
    : null;
  const bookValue = financeProfile?.depreciation?.net_book_value != null
    ? Number(financeProfile.depreciation.net_book_value)
    : null;
  const maintenanceToBookPct =
    economicLifetimeValue != null && bookValue != null && Number.isFinite(bookValue) && bookValue > 0
      ? (economicLifetimeValue / bookValue) * 100
      : null;

  return (
    <Card className="border-border/80 shadow-none">
      <CardContent className="p-5">
        <div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Economía</p>
            <h2 className="mt-1 text-lg font-semibold">Inversión en mantenimiento</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Gasto reconocido y enlazado al equipo. No equivale al costo total de propiedad.
            </p>
          </div>
          {economicLastCostDate ? (
            <p className="text-xs text-muted-foreground">Corte {date(economicLastCostDate)}</p>
          ) : null}
        </div>

        {financeProfile?.insurance || financeProfile?.depreciation ? (
          <div className="border-b border-border py-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Economía canónica del activo</p>
              {financeProfile.insurance?.canonical || financeProfile.depreciation?.canonical ? (
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  Canónico · {financeProfile.insurance?.authority || financeProfile.depreciation?.authority || 'Finanzas'}
                </span>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <IdentityItem
                icon={ShieldCheck}
                label="Valor asegurado"
                value={financeProfile.insurance?.insured_uf != null
                  ? `${number(financeProfile.insurance.insured_uf, 2)} UF`
                  : 'Sin base'}
                meta={financeProfile.insurance?.source_cutoff_date
                  ? `Fuente ${date(financeProfile.insurance.source_cutoff_date)}`
                  : financeProfile.insurance?.source_file || null}
              />
              <IdentityItem
                icon={Coins}
                label="Valor libro"
                value={financeProfile.depreciation?.net_book_value != null
                  ? money(financeProfile.depreciation.net_book_value)
                  : 'Pendiente de vincular'}
                meta={financeProfile.depreciation?.source_cutoff_date
                  ? `Fuente ${date(financeProfile.depreciation.source_cutoff_date)}`
                  : Number(financeProfile.depreciation_conflict_count || 0) > 1
                    ? `${financeProfile.depreciation_conflict_count} registros canónicos vinculados; Daniel debe resolver cuál aplica`
                    : financeProfile.depreciation_identity_pending
                      ? 'La depreciación canónica aún no está conciliada con este activo'
                      : null}
              />
              <IdentityItem
                icon={CalendarDays}
                label="Depreciación del período"
                value={financeProfile.depreciation?.depreciation_current != null
                  ? money(financeProfile.depreciation.depreciation_current)
                  : Number(financeProfile.depreciation_conflict_count || 0) > 1
                    ? 'Revisión requerida'
                    : 'Sin vínculo'}
                meta={Number(financeProfile.depreciation_conflict_count || 0) > 1
                  ? 'No se selecciona una fila automáticamente'
                  : financeProfile.depreciation?.review_flags?.length
                    ? `${financeProfile.depreciation.review_flags.length} observación(es) para Finanzas`
                    : 'La fuente permanece canónica'}
              />
            </div>
            {maintenanceToBookPct != null ? (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">Mantenimiento reconocido / valor libro</p>
                <p className="mt-1 text-sm font-medium tabular-nums">{number(maintenanceToBookPct, 1)}%</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Relación descriptiva entre gasto histórico reconocido en MOTIL y valor libro canónico. No representa TCO ni recomienda reemplazo.
                </p>
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Seguro, valor libro y depreciación son conceptos distintos. MOTIL los mantiene separados hasta contar con una conciliación exacta por activo.
            </p>
          </div>
        ) : null}

        {economicLifetimeValue != null || economicHistory.length > 0 ? (
          <div>
            <div className="grid gap-4 py-5 sm:grid-cols-3">
              <IdentityItem
                icon={Coins}
                label="Histórico acumulado"
                value={economicLifetimeValue != null ? money(economicLifetimeValue) : 'Sin base'}
                meta={economicFirstCostDate ? `Desde ${date(economicFirstCostDate)}` : null}
              />
              <IdentityItem
                icon={CalendarDays}
                label="Últimos 12 meses"
                value={economic12mValue != null ? money(economic12mValue) : 'Sin base'}
                meta={economicLastCostDate ? `Corte ${date(economicLastCostDate)}` : null}
              />
              <IdentityItem
                icon={CalendarDays}
                label="Última imputación"
                value={date(economicLastCostDate)}
                meta={economicMovementCount > 0 ? `${economicMovementCount} movimientos reconocidos` : null}
              />
            </div>

            {(economicYtdValue != null || economicAnnualAverage != null || economicHistory.length > 0) ? (
              <details className="group border-t border-border pt-4">
                <summary className="cursor-pointer list-none">
                  <span className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">Detalle económico</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <IdentityItem
                    icon={CalendarDays}
                    label="Año en curso"
                    value={economicYtdValue != null ? money(economicYtdValue) : 'Sin base'}
                  />
                  <IdentityItem
                    icon={Coins}
                    label="Promedio anual"
                    value={economicAnnualAverage != null ? money(economicAnnualAverage) : 'Sin base'}
                    meta={economicYearsWithMovements > 0 ? `${economicYearsWithMovements} años con movimientos` : null}
                  />
                </div>
                {economicHistory.length > 0 ? (
                  <div className="mt-4 divide-y divide-border border-t border-border">
                    {economicHistory.slice(0, 6).map((row) => (
                      <div key={String(row.fiscal_year)} className="grid gap-3 py-3 sm:grid-cols-[100px_140px_minmax(0,1fr)] sm:items-center">
                        <p className="text-sm font-semibold">{row.fiscal_year || 'Sin año'}</p>
                        <p className="text-sm">{money(row.historical_total_cost)}</p>
                        <p className="text-xs text-muted-foreground">
                          {number(row.movement_count || 0, 0)} movimientos · {date(row.first_cost_date)} → {date(row.last_cost_date)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </details>
            ) : null}
          </div>
        ) : (
          <div className="py-5">
            <p className="text-sm font-medium">Sin historial de costos enlazado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No se registra inversión histórica de mantenimiento para este equipo en las fuentes disponibles. Esto no equivale a costo cero.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
