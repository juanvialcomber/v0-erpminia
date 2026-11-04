export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';

type Severity = 'critical' | 'warning' | 'observation';
type Kind = 'integration_error' | 'data_inconsistency' | 'reconciliation_pending';

type LaudusIssue = {
  key: string;
  area: string;
  kind: Kind;
  severity: Severity;
  count: number;
  title: string;
  detail: string;
  href: string;
  observedAt?: string | null;
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hoursBetween(older: string | null | undefined, newer: string | null | undefined) {
  if (!older || !newer) return null;
  const olderMs = new Date(older).getTime();
  const newerMs = new Date(newer).getTime();
  if (!Number.isFinite(olderMs) || !Number.isFinite(newerMs)) return null;
  return Math.max(0, Math.round(((newerMs - olderMs) / 3_600_000) * 10) / 10);
}

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La revisión consolidada Laudus requiere permisos de administración.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [
      healthResult,
      inventoryResult,
      supplierResult,
      negativeResult,
      fixedPendingResult,
      costCenterPendingResult,
      incidentResult,
    ] = await Promise.all([
      context.supabase
        .from('laudus_sync_health_service_v1')
        .select('domain,health_status,last_success_at,last_failure_at,conflicts,consecutive_failures,last_error,open_incidents,critical_incidents,freshness_observed_at')
        .eq('organization_id', context.organizationId)
        .order('run_order', { ascending: true }),
      context.supabase
        .from('laudus_inventory_reconciliation_summary_service_v1')
        .select('compared_products,aligned_products,quantity_mismatches,missing_in_motil_nonzero,laudus_only_zero,laudus_negative_products,latest_laudus_stock_sync,latest_motil_stock_update')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      context.supabase
        .from('laudus_supplier_bridge_summary_service_v1')
        .select('total_names,verified_names,placeholder_names,unresolved_names,ambiguous_names,evaluated_at')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      context.supabase
        .from('laudus_negative_stock_positions_service_v1')
        .select('product_external_id,sku,description,unit_of_measure,warehouse_external_id,warehouse_name,warehouse_stock,source_date_to,synced_at')
        .eq('organization_id', context.organizationId)
        .order('warehouse_stock', { ascending: true })
        .limit(50),
      context.supabase
        .from('laudus_fixed_assets_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('reconciliation_status', 'pending'),
      context.supabase
        .from('laudus_cost_centers_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .neq('reconciliation_status', 'matched'),
      context.supabase.rpc('motil_get_laudus_data_quality_incident_summary_v2', {
        p_organization_id: context.organizationId,
      }),
    ]);

    const errors = [
      healthResult.error,
      inventoryResult.error,
      supplierResult.error,
      negativeResult.error,
      fixedPendingResult.error,
      costCenterPendingResult.error,
      incidentResult.error,
    ].filter(Boolean);
    if (errors.length) throw errors[0];

    const issues: LaudusIssue[] = [];
    const healthRows = healthResult.data || [];

    for (const row of healthRows) {
      const conflicts = n(row.conflicts);
      const openIncidents = n(row.open_incidents);
      const criticalIncidents = n(row.critical_incidents);
      const failures = n(row.consecutive_failures);
      const unhealthy = String(row.health_status || '').toLowerCase() !== 'healthy' || failures > 0 || Boolean(row.last_error);
      if (unhealthy) {
        issues.push({
          key: `sync:${row.domain}`,
          area: String(row.domain || 'sync'),
          kind: 'integration_error',
          severity: failures > 0 || criticalIncidents > 0 ? 'critical' : 'warning',
          count: Math.max(1, failures, openIncidents),
          title: `Sync Laudus · ${row.domain}`,
          detail: row.last_error || `Estado ${row.health_status || 'desconocido'} · ${failures} falla(s) consecutiva(s).`,
          href: '/dashboard/calidad-datos/salud',
          observedAt: row.freshness_observed_at || row.last_failure_at || null,
        });
      }
      if (conflicts > 0) {
        issues.push({
          key: `domain-conflicts:${row.domain}`,
          area: String(row.domain || 'sync'),
          kind: 'data_inconsistency',
          severity: 'warning',
          count: conflicts,
          title: `Conflictos detectados · ${row.domain}`,
          detail: `${conflicts.toLocaleString('es-CL')} conflicto(s) reportado(s) por el último control del dominio. No implican corrección automática.`,
          href: '/dashboard/calidad-datos',
          observedAt: row.freshness_observed_at || null,
        });
      }
    }

    const inventory = inventoryResult.data || null;
    if (inventory) {
      const lagHours = hoursBetween(inventory.latest_motil_stock_update, inventory.latest_laudus_stock_sync);
      const staleComparison = lagHours == null || lagHours > 24;
      if (staleComparison && (n(inventory.quantity_mismatches) > 0 || n(inventory.missing_in_motil_nonzero) > 0)) {
        issues.push({
          key: 'inventory:stale-comparison',
          area: 'stock',
          kind: 'data_inconsistency',
          severity: 'warning',
          count: n(inventory.quantity_mismatches) + n(inventory.missing_in_motil_nonzero),
          title: 'Comparación stock MOTIL ↔ Laudus no concluyente',
          detail: `Laudus está más fresco que MOTIL${lagHours == null ? '' : ` por ${lagHours.toLocaleString('es-CL')} h`}. Se conservan ${n(inventory.quantity_mismatches).toLocaleString('es-CL')} diferencias y ${n(inventory.missing_in_motil_nonzero).toLocaleString('es-CL')} faltantes como evidencia, no como errores confirmados.`,
          href: '/dashboard/bodega',
          observedAt: inventory.latest_laudus_stock_sync || null,
        });
      } else if (n(inventory.quantity_mismatches) > 0 || n(inventory.missing_in_motil_nonzero) > 0) {
        issues.push({
          key: 'inventory:comparable-differences',
          area: 'stock',
          kind: 'data_inconsistency',
          severity: 'warning',
          count: n(inventory.quantity_mismatches) + n(inventory.missing_in_motil_nonzero),
          title: 'Diferencias de stock comparables',
          detail: `${n(inventory.quantity_mismatches).toLocaleString('es-CL')} diferencias de cantidad y ${n(inventory.missing_in_motil_nonzero).toLocaleString('es-CL')} SKU con saldo Laudus sin contraparte MOTIL.`,
          href: '/dashboard/bodega',
          observedAt: inventory.latest_laudus_stock_sync || null,
        });
      }
    }

    const negativeRows = negativeResult.data || [];
    if (negativeRows.length) {
      issues.push({
        key: 'inventory:negative-laudus',
        area: 'stock',
        kind: 'data_inconsistency',
        severity: 'critical',
        count: negativeRows.length,
        title: 'Saldos negativos en Laudus',
        detail: `${negativeRows.length.toLocaleString('es-CL')} posición(es) Laudus con saldo negativo requieren revisar movimientos, recepciones, consumos o conteos antes de usar disponibilidad.`,
        href: '/dashboard/bodega',
        observedAt: negativeRows[0]?.synced_at || null,
      });
    }

    const supplier = supplierResult.data || null;
    if (supplier) {
      const supplierGaps = n(supplier.placeholder_names) + n(supplier.unresolved_names) + n(supplier.ambiguous_names);
      if (supplierGaps > 0) {
        issues.push({
          key: 'suppliers:bridge-gaps',
          area: 'suppliers',
          kind: 'reconciliation_pending',
          severity: n(supplier.ambiguous_names) > 0 ? 'warning' : 'observation',
          count: supplierGaps,
          title: 'Proveedores Laudus por resolver',
          detail: `${n(supplier.placeholder_names)} placeholder · ${n(supplier.unresolved_names)} sin resolver · ${n(supplier.ambiguous_names)} ambiguo(s).`,
          href: '/dashboard/compras',
          observedAt: supplier.evaluated_at || null,
        });
      }
    }

    const fixedPending = fixedPendingResult.count ?? 0;
    if (fixedPending > 0) {
      issues.push({
        key: 'fixed-assets:pending',
        area: 'fixed_assets',
        kind: 'reconciliation_pending',
        severity: 'observation',
        count: fixedPending,
        title: 'Activos fijos Laudus sin conciliación',
        detail: `${fixedPending.toLocaleString('es-CL')} activo(s) contable(s) siguen sin vínculo confirmado con un activo operacional MOTIL.`,
        href: '/dashboard/finanzas/activos-laudus',
      });
    }

    const costCenterPending = costCenterPendingResult.count ?? 0;
    if (costCenterPending > 0) {
      issues.push({
        key: 'cost-centers:pending',
        area: 'cost_centers',
        kind: 'reconciliation_pending',
        severity: 'observation',
        count: costCenterPending,
        title: 'Centros de costo Laudus por conciliar',
        detail: `${costCenterPending.toLocaleString('es-CL')} centro(s) de costo todavía no tienen match confirmado con el modelo operacional MOTIL.`,
        href: '/dashboard/finanzas/centros',
      });
    }

    for (const row of incidentResult.data || []) {
      const open = n(row.open_incidents);
      if (open <= 0) continue;
      const errors = n(row.error_incidents);
      const critical = n(row.critical_incidents);
      const warnings = n(row.warning_incidents);
      issues.push({
        key: `source-quality:${row.domain}`,
        area: String(row.domain || 'source'),
        kind: 'data_inconsistency',
        severity: critical > 0 || errors > 0 ? 'critical' : 'warning',
        count: open,
        title: `Incidentes de fuente Laudus · ${row.domain}`,
        detail: `${open} abierto(s) · ${critical} crítico(s) · ${errors} error(es) · ${warnings} advertencia(s). La fuente se preserva; el incidente no muta el dato Laudus.`,
        href: '/dashboard/calidad-datos/salud',
      });
    }

    const severityRank: Record<Severity, number> = { critical: 0, warning: 1, observation: 2 };
    issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count || a.title.localeCompare(b.title, 'es-CL'));

    const summary = {
      categories: issues.length,
      totalSignals: issues.reduce((sum, row) => sum + row.count, 0),
      critical: issues.filter((row) => row.severity === 'critical').reduce((sum, row) => sum + row.count, 0),
      integrationErrors: issues.filter((row) => row.kind === 'integration_error').reduce((sum, row) => sum + row.count, 0),
      inconsistencies: issues.filter((row) => row.kind === 'data_inconsistency').reduce((sum, row) => sum + row.count, 0),
      reconciliationPending: issues.filter((row) => row.kind === 'reconciliation_pending').reduce((sum, row) => sum + row.count, 0),
      healthyDomains: healthRows.filter((row) => String(row.health_status || '').toLowerCase() === 'healthy').length,
      totalDomains: healthRows.length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary,
      issues,
      policy: {
        oneQueue: 'Esta vista consolida señales Laudus; no crea un segundo maestro de datos.',
        noAutoFix: 'Ninguna incidencia modifica Laudus ni MOTIL automáticamente.',
        businessFacts: 'Estados normales de negocio, como factura impaga o saldo por pagar, no se clasifican como error Laudus.',
      },
    });
  } catch (error) {
    console.error('[laudus/issues]', error);
    return NextResponse.json({ error: 'No fue posible consolidar las inconsistencias Laudus.' }, { status: 500 });
  }
}
