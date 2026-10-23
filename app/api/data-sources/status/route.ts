export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type SourceState = 'updated' | 'syncing' | 'review' | 'offline' | 'pending';

type SourceStatus = {
  key: string;
  label: string;
  state: SourceState;
  detail: string;
  updatedAt: string | null;
  reviewCount?: number;
};

type QueryResult = { data: any; error: any; count?: number | null };

const emptyMany = (): Promise<QueryResult> => Promise.resolve({ data: [], error: null, count: 0 });
const emptyOne = (): Promise<QueryResult> => Promise.resolve({ data: null, error: null });

function ok(result: QueryResult | null | undefined) {
  return Boolean(result && !result.error);
}

function latestDate(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function baseStatus(
  key: string,
  label: string,
  result: QueryResult,
  detail: string,
  updatedAt?: string | null,
): SourceStatus {
  if (result.error) {
    return { key, label, state: 'review', detail: 'La fuente no pudo verificarse.', updatedAt: null };
  }
  return { key, label, state: 'updated', detail, updatedAt: updatedAt ?? null };
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [inventoryAccess, procurementAccess, financeAccess, maintenanceAccess] = await Promise.all([
    requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO),
    requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS),
    requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS),
    requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES),
  ]);

  const canInventory = inventoryAccess.authorized;
  const canProcurement = procurementAccess.authorized;
  const canFinance = financeAccess.authorized;
  const canMaintenance = maintenanceAccess.authorized;
  const canSeeExternalErp = canInventory || canProcurement || canFinance || canMaintenance;
  const org = context.organizationId;

  try {
    const [inventoryOverview, inventorySnapshot, procurementQuality, procurementExceptions, financeOverview] = await Promise.all([
      canInventory
        ? context.supabase.from('inventory_intelligence_overview_v1').select('products_with_stock,negative_stock_products').eq('organization_id', org).maybeSingle()
        : emptyOne(),
      canInventory
        ? context.supabase.from('canonical_inventory_current').select('snapshot_date').eq('organization_id', org).order('snapshot_date', { ascending: false }).limit(1)
        : emptyMany(),
      canProcurement
        ? context.supabase.from('purchase_order_quality').select('quality_status').eq('organization_id', org)
        : emptyMany(),
      canProcurement
        ? context.supabase.from('procurement_match_exceptions').select('status').eq('organization_id', org)
        : emptyMany(),
      canFinance
        ? context.supabase.from('canonical_finance_overview').select('recognized_clp,committed_clp').eq('organization_id', org).maybeSingle()
        : emptyOne(),
    ]);

    const visibleSources: SourceStatus[] = [];

    if (canInventory) {
      const inventoryNegative = ok(inventoryOverview)
        ? Number(inventoryOverview.data?.negative_stock_products || 0)
        : 0;
      const inventoryUpdatedAt = latestDate(inventorySnapshot.data?.[0]?.snapshot_date);
      const inventory = baseStatus(
        'inventory',
        'Bodega MOTIL',
        inventoryOverview,
        'Existencias, reservas, conteos y movimientos operacionales.',
        inventoryUpdatedAt,
      );
      if (inventory.state === 'updated' && inventoryNegative > 0) {
        inventory.state = 'review';
        inventory.reviewCount = inventoryNegative;
        inventory.detail = `${inventoryNegative} producto(s) requieren conciliación de saldo.`;
      }
      visibleSources.push(inventory);
    }

    if (canProcurement) {
      const openProcurementExceptions = ok(procurementExceptions)
        ? (procurementExceptions.data || []).filter((row: any) =>
            !['resolved', 'closed', 'ignored'].includes(String(row.status || '').toLowerCase()),
          ).length
        : 0;
      const procurement = baseStatus(
        'procurement',
        'Compras',
        procurementQuality,
        'OC, recepciones, facturas y matching operacional.',
      );
      if (procurement.state === 'updated' && openProcurementExceptions > 0) {
        procurement.state = 'review';
        procurement.reviewCount = openProcurementExceptions;
        procurement.detail = `${openProcurementExceptions} excepción(es) de compra requieren revisión.`;
      }
      visibleSources.push(procurement);
    }

    if (canFinance) {
      visibleSources.push(baseStatus(
        'finance',
        'Finanzas',
        financeOverview,
        'Costos, compromisos, cuentas por pagar y trazabilidad.',
      ));
    }

    if (canSeeExternalErp) {
      let laudus: SourceStatus = {
        key: 'laudus',
        label: 'Laudus',
        state: 'pending',
        detail: 'API activa; verificando última sincronización.',
        updatedAt: null,
      };

      try {
        const source = await context.supabase
          .schema('integration')
          .from('external_sources')
          .select('id,enabled,mode,updated_at')
          .eq('organization_id', org)
          .eq('source_key', 'laudus')
          .maybeSingle();

        if (!source.error && source.data) {
          if (!source.data.enabled) {
            laudus = {
              ...laudus,
              detail: 'Conector preparado; sincronización desactivada.',
              updatedAt: latestDate(source.data.updated_at),
            };
          } else {
            const [latestRun, reviewCount] = await Promise.all([
              context.supabase
                .schema('integration')
                .from('sync_runs')
                .select('status,finished_at,started_at,error_summary')
                .eq('organization_id', org)
                .eq('source_id', source.data.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
              context.supabase
                .schema('integration')
                .from('reconciliation_items')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('source_id', source.data.id)
                .in('resolution_status', ['pending', 'conflict', 'new_candidate']),
            ]);

            const run = latestRun.data;
            const unresolved = reviewCount.count ?? 0;
            if (run?.status === 'running' || run?.status === 'queued') {
              laudus = {
                key: 'laudus',
                label: 'Laudus',
                state: 'syncing',
                detail: 'Sincronización en curso.',
                updatedAt: latestDate(run.started_at),
                reviewCount: unresolved,
              };
            } else if (run?.status === 'failed' || run?.status === 'partial' || unresolved > 0) {
              laudus = {
                key: 'laudus',
                label: 'Laudus',
                state: 'review',
                detail: unresolved > 0
                  ? `${unresolved} registro(s) requieren conciliación.`
                  : 'La última sincronización requiere revisión.',
                updatedAt: latestDate(run?.finished_at || run?.started_at),
                reviewCount: unresolved,
              };
            } else if (run?.status === 'completed') {
              laudus = {
                key: 'laudus',
                label: 'Laudus',
                state: 'updated',
                detail: 'ERP sincronizado y sin excepciones abiertas.',
                updatedAt: latestDate(run.finished_at),
                reviewCount: 0,
              };
            } else {
              laudus = {
                key: 'laudus',
                label: 'Laudus',
                state: 'pending',
                detail: 'Conector habilitado; primera sincronización pendiente.',
                updatedAt: latestDate(source.data.updated_at),
              };
            }
          }
        }
      } catch {
        // The integration schema may not be deployed yet. That is an expected pre-activation state.
      }

      visibleSources.push(laudus);
    }

    if (visibleSources.length) {
      const canonical: SourceStatus = {
        key: 'canonical',
        label: 'Datos canónicos',
        state: visibleSources.some((item) => item.key !== 'laudus' && item.state === 'review') ? 'review' : 'updated',
        detail: 'Estado consolidado sólo de los dominios que tu perfil puede consultar.',
        updatedAt: null,
      };
      visibleSources.unshift(canonical);
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sources: visibleSources,
      authorizedDomains: {
        inventory: canInventory,
        procurement: canProcurement,
        finance: canFinance,
        maintenance: canMaintenance,
      },
    });
  } catch (error) {
    console.error('[data-sources/status]', error);
    return NextResponse.json({ error: 'No fue posible verificar las fuentes de datos.' }, { status: 500 });
  }
}
