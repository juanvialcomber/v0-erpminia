export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { listPendingApprovalsForUser } from '@/lib/api/documents';
import { getLegalComplianceOverview } from '@/lib/api/contracts';
import { listInventoryStockAlerts } from '@/lib/api/inventory-stock-alerts';
import { LEGAL_CONTRACT_SOURCE_META, LEGAL_PROGRESS_MILESTONES } from '@/lib/legal/contract-progress-source';

type AlertSeverity = 'critica' | 'alta' | 'media' | 'baja' | 'info';
type AlertType = 'documento' | 'mantenimiento' | 'inventario' | 'sostenibilidad' | 'contrato';

type AlertItem = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  type: AlertType;
  timestamp: string | null;
  actionRequired: boolean;
  actionUrl: string;
};

type PendingApprovalItem = {
  id: string;
  levelName: string;
  document: {
    title: string;
    documentNumber?: string | null;
    createdAt?: string | null;
  };
};

type LegalComplianceOverview = {
  contracts_pending_review: Array<{
    id: string;
    title: string;
    days_until_expiry?: number | null;
    end_date?: string | null;
  }>;
  expiring_contracts: Array<{
    id: string;
    title: string;
    days_until_expiry?: number | null;
    end_date?: string | null;
  }>;
  expiring_documents: Array<{
    id: string;
    title: string;
    expiry_date?: string | null;
  }>;
};

type WorkOrderAlertRow = {
  id: string;
  work_order_number?: string | null;
  title: string;
  description?: string | null;
  priority?: string | null;
  status?: string | null;
  created_at?: string | null;
  scheduled_date?: string | null;
  canonical_asset_id?: string | null;
  assetName?: string | null;
};

type OverdueNCRow = {
  id: string;
  nc_number?: string | null;
  title: string;
  severity?: string | null;
  target_closure_date?: string | null;
  status?: string | null;
};

type OverdueCARow = {
  id: string;
  ca_number?: string | null;
  action_description?: string | null;
  scheduled_completion_date?: string | null;
  status?: string | null;
  nonconformance?:
    | { title?: string | null; severity?: string | null; organization_id?: string | null }
    | Array<{ title?: string | null; severity?: string | null; organization_id?: string | null }>
    | null;
};

type SourceResult<T> = {
  name: string;
  available: boolean;
  data: T;
};

function sourceDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function daysOverdue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.ceil((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)));
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function sourceContractProgress(contractNumber: string) {
  const rows = LEGAL_PROGRESS_MILESTONES.filter((item) => item.contractNumber === contractNumber);
  const total = rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const executed = rows.reduce((sum, item) => sum + Number(item.executedAmount || 0), 0);
  return {
    detailed: rows.length > 0,
    progressRatio: total > 0 ? executed / total : null,
  };
}

function sourceContractDays(endDate: string | null | undefined) {
  if (!endDate) return null;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const base = new Date(`${today}T12:00:00Z`).getTime();
  const target = new Date(`${endDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(base) || !Number.isFinite(target)) return null;
  return Math.round((target - base) / 86400000);
}

function severityFromPriority(priority: string | null | undefined): AlertSeverity {
  const normalized = String(priority || '').toLowerCase();
  if (normalized.includes('crit')) return 'critica';
  if (normalized.includes('high') || normalized.includes('alta')) return 'alta';
  if (normalized.includes('medium') || normalized.includes('media')) return 'media';
  if (normalized.includes('low') || normalized.includes('baja')) return 'baja';
  return 'info';
}

function severityFromDays(days: number | null, base: AlertSeverity = 'media'): AlertSeverity {
  if (days == null) return base;
  if (days > 14) return 'critica';
  if (days > 7) return 'alta';
  if (days > 3) return base === 'baja' ? 'media' : base;
  return base;
}

async function querySource<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<SourceResult<T>> {
  try {
    return { name, available: true, data: await fn() };
  } catch (error) {
    console.error(`[alertas] Fuente no disponible: ${name}`, error);
    return { name, available: false, data: fallback };
  }
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const DEMO_ORG = '550e8400-e29b-41d4-a716-446655440000';

  try {
    if (context.organizationId === DEMO_ORG) {
      const mockAlerts: AlertItem[] = [
        {
          id: 'demo-wo-1',
          title: 'OT Crítica - Perforadora Atlas Copco ROC',
          description: 'OT-DEMO-0001. Mantenimiento urgente requerido.',
          severity: 'critica',
          type: 'mantenimiento',
          timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
          actionRequired: true,
          actionUrl: '/dashboard/mantenimiento',
        },
        {
          id: 'demo-nc-1',
          title: 'NC Vencida - Inspección equipo EX-001',
          description: 'NC-2025-001. Vencida hace 3 días.',
          severity: 'alta',
          type: 'sostenibilidad',
          timestamp: new Date(Date.now() - 72 * 3600000).toISOString(),
          actionRequired: true,
          actionUrl: '/dashboard/sostenibilidad',
        },
      ];

      return NextResponse.json({
        alerts: mockAlerts,
        stats: {
          total: mockAlerts.length,
          critical: mockAlerts.filter((alert) => alert.severity === 'critica').length,
          actionRequired: mockAlerts.filter((alert) => alert.actionRequired).length,
        },
        sourceStatus: { available: 6, total: 6, complete: true, unavailable: [] },
        generatedAt: new Date().toISOString(),
      });
    }

    const { data: currentProfile } = await context.supabase
      .from('profiles')
      .select('email')
      .eq('id', context.userId)
      .eq('organization_id', context.organizationId)
      .maybeSingle();

    const currentEmail = String(currentProfile?.email || '').trim().toLowerCase();
    const isElias = currentEmail === 'eliasfernandez@lapatagua.cl';
    const isAriel = currentEmail === 'ariellopez@lapatagua.cl';

    const [pendingApprovalsSource, legalSource, workOrdersSource, stockSource, overdueNCSource, overdueCASource] =
      await Promise.all([
        querySource(
          'Aprobaciones documentales',
          () => listPendingApprovalsForUser(context.organizationId, context.userId) as Promise<PendingApprovalItem[]>,
          [] as PendingApprovalItem[],
        ),
        querySource(
          'Legal y cumplimiento',
          () => getLegalComplianceOverview(context.organizationId) as Promise<LegalComplianceOverview>,
          { contracts_pending_review: [], expiring_contracts: [], expiring_documents: [] } as LegalComplianceOverview,
        ),
        querySource(
          'Órdenes de trabajo',
          async () => {
            const { data, error } = await context.supabase
              .from('maintenance_work_orders')
              .select('id, work_order_number, title, description, priority, status, created_at, scheduled_date, canonical_asset_id')
              .eq('organization_id', context.organizationId)
              .in('status', ['open', 'in_progress'])
              .order('created_at', { ascending: false })
              .limit(20);
            if (error) throw error;

            const rows = (data || []) as WorkOrderAlertRow[];
            const assetIds = Array.from(new Set(rows.map((row) => row.canonical_asset_id).filter(Boolean))) as string[];
            if (!assetIds.length) return rows;

            const assetResult = await context.supabase
              .from('maintenance_canonical_assets_v1')
              .select('id,name')
              .eq('organization_id', context.organizationId)
              .in('id', assetIds);
            if (assetResult.error) throw assetResult.error;

            const assetNames = new Map((assetResult.data || []).map((asset) => [asset.id, asset.name]));
            return rows.map((row) => ({
              ...row,
              assetName: row.canonical_asset_id ? assetNames.get(row.canonical_asset_id) || null : null,
            }));
          },
          [] as WorkOrderAlertRow[],
        ),
        querySource(
          'Inventario',
          () => listInventoryStockAlerts({ organizationId: context.organizationId, supabase: context.supabase }),
          { items: [], evaluatedItems: 0, dataSource: 'warehouse' as const },
        ),
        querySource(
          'No conformidades',
          async () => {
            const { data, error } = await context.supabase
              .from('sostenibilidad_nonconformances')
              .select('id, nc_number, title, severity, target_closure_date, status')
              .eq('organization_id', context.organizationId)
              .lt('target_closure_date', new Date().toLocaleDateString('en-CA'))
              .neq('status', 'cerrada')
              .limit(20);
            if (error) throw error;
            return (data || []) as OverdueNCRow[];
          },
          [] as OverdueNCRow[],
        ),
        querySource(
          'Acciones correctivas',
          async () => {
            const { data, error } = await context.supabase
              .from('sostenibilidad_corrective_actions')
              .select('id, ca_number, action_description, scheduled_completion_date, status, nonconformance:sostenibilidad_nonconformances!inner(title, severity, organization_id)')
              .lt('scheduled_completion_date', new Date().toLocaleDateString('en-CA'))
              .neq('status', 'verificada')
              .limit(20);
            if (error) throw error;
            return (data || []).filter((item: OverdueCARow) => {
              const nc = Array.isArray(item.nonconformance) ? item.nonconformance[0] : item.nonconformance;
              return nc?.organization_id === context.organizationId;
            }) as OverdueCARow[];
          },
          [] as OverdueCARow[],
        ),
      ]);

    const sources = [pendingApprovalsSource, legalSource, workOrdersSource, stockSource, overdueNCSource, overdueCASource];
    const unavailable = sources.filter((source) => !source.available).map((source) => source.name);
    const alerts: AlertItem[] = [];

    if (isElias || isAriel) {
      for (const [contractNumber, sourceMeta] of Object.entries(LEGAL_CONTRACT_SOURCE_META)) {
        if (!sourceMeta?.endDate) continue;
        if (isAriel && !contractNumber.startsWith('IO-')) continue;

        const progress = sourceContractProgress(contractNumber);
        if (!progress.detailed || progress.progressRatio === null || progress.progressRatio >= 0.999) continue;

        const days = sourceContractDays(sourceMeta.endDate);
        if (days === null || days > 15) continue;

        const overdue = days < 0;
        const title = overdue
          ? `Contrato atrasado según fecha fuente - ${contractNumber}`
          : `Contrato próximo a fecha fuente - ${contractNumber}`;
        const timing = overdue
          ? `la fecha fuente venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`
          : `faltan ${days} día${days === 1 ? '' : 's'} para la fecha fuente`;
        const progressLabel = new Intl.NumberFormat('es-CL', {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(progress.progressRatio);

        alerts.push({
          id: `elias-contract-schedule-${contractNumber}`,
          title,
          description: `Fecha fuente Elías: ${sourceMeta.endDate}; ${timing}; avance físico estructurado ${progressLabel}. Señal para revisión, no declaración automática de incumplimiento.`,
          severity: overdue ? 'alta' : days <= 7 ? 'alta' : 'media',
          type: 'contrato',
          timestamp: sourceDate(sourceMeta.endDate),
          actionRequired: true,
          actionUrl: '/dashboard/legal/avances-pagos',
        });
      }
    }

    for (const approval of pendingApprovalsSource.data) {
      alerts.push({
        id: `approval-${approval.id}`,
        title: `Aprobación pendiente - ${approval.document.title}`,
        description: `Te corresponde revisar ${approval.levelName.toLowerCase()} del documento ${approval.document.documentNumber || approval.document.title}.`,
        severity: 'media',
        type: 'documento',
        timestamp: sourceDate(approval.document.createdAt),
        actionRequired: true,
        actionUrl: '/dashboard/documentos',
      });
    }

    for (const contract of legalSource.data.contracts_pending_review || []) {
      alerts.push({
        id: `contract-review-${contract.id}`,
        title: `Contrato en revisión - ${contract.title}`,
        description: 'Contrato pendiente de revisión legal o cumplimiento.',
        severity: 'alta',
        type: 'contrato',
        timestamp: null,
        actionRequired: true,
        actionUrl: '/dashboard/legal',
      });
    }

    for (const contract of legalSource.data.expiring_contracts || []) {
      const days = contract.days_until_expiry ?? daysUntil(contract.end_date);
      const dayLabel = days == null ? 'con fecha de vencimiento por revisar' : `vence en ${days} día${days === 1 ? '' : 's'}`;
      alerts.push({
        id: `contract-expiring-${contract.id}`,
        title: `Contrato por vencer - ${contract.title}`,
        description: `Contrato ${dayLabel}. Requiere seguimiento contractual.`,
        severity: days != null && days <= 7 ? 'critica' : 'alta',
        type: 'contrato',
        timestamp: sourceDate(contract.end_date),
        actionRequired: true,
        actionUrl: '/dashboard/legal',
      });
    }

    for (const document of legalSource.data.expiring_documents || []) {
      const days = daysUntil(document.expiry_date);
      const dayLabel = days == null ? 'con fecha de vencimiento por revisar' : `con vencimiento en ${days} día${days === 1 ? '' : 's'}`;
      alerts.push({
        id: `document-expiring-${document.id}`,
        title: `Documento por vencer - ${document.title}`,
        description: `Documento regulatorio ${dayLabel}.`,
        severity: days != null && days <= 7 ? 'alta' : 'media',
        type: 'documento',
        timestamp: sourceDate(document.expiry_date),
        actionRequired: true,
        actionUrl: '/dashboard/legal',
      });
    }

    for (const workOrder of workOrdersSource.data) {
      const severity = severityFromPriority(workOrder.priority);
      if (!['critica', 'alta', 'media'].includes(severity)) continue;
      alerts.push({
        id: `wo-${workOrder.id}`,
        title: `${severity === 'critica' ? 'Orden crítica' : 'Orden prioritaria'} - ${workOrder.title}`,
        description: workOrder.description || `OT ${workOrder.work_order_number || ''} asociada a ${workOrder.assetName || 'equipo operativo'}.`,
        severity,
        type: 'mantenimiento',
        timestamp: sourceDate(workOrder.created_at || workOrder.scheduled_date),
        actionRequired: severity !== 'media' || workOrder.status === 'open',
        actionUrl: '/dashboard/mantenimiento/ordenes-trabajo',
      });
    }

    const lowStockRows = stockSource.data.items;
    for (const stock of lowStockRows) {
      const current = Number(stock.quantity_on_hand || 0);
      const reorder = Number(stock.reorder_level || 0);
      alerts.push({
        id: `stock-${stock.id}`,
        title: `${current === 0 ? 'Stock agotado' : 'Stock bajo'} - ${stock.part_name || stock.part_code}`,
        description: `${stock.part_code || 'Item'} en ${stock.location_label} con ${current} unidad(es). Nivel de reorden: ${reorder}.`,
        severity: current === 0 ? 'critica' : 'alta',
        type: 'inventario',
        timestamp: null,
        actionRequired: true,
        actionUrl: '/dashboard/inventario',
      });
    }

    for (const nc of overdueNCSource.data) {
      const overdueDays = daysOverdue(nc.target_closure_date);
      const overdueLabel = overdueDays == null ? 'con fecha objetivo no disponible' : `lleva ${overdueDays} día${overdueDays === 1 ? '' : 's'} vencida`;
      alerts.push({
        id: `nc-${nc.id}`,
        title: `No conformidad vencida - ${nc.nc_number || nc.title}`,
        description: `${nc.title}. ${overdueLabel}.`,
        severity: severityFromDays(overdueDays, severityFromPriority(nc.severity)),
        type: 'sostenibilidad',
        timestamp: sourceDate(nc.target_closure_date),
        actionRequired: true,
        actionUrl: '/dashboard/sostenibilidad',
      });
    }

    for (const ca of overdueCASource.data) {
      const overdueDays = daysOverdue(ca.scheduled_completion_date);
      const nc = Array.isArray(ca.nonconformance) ? ca.nonconformance[0] : ca.nonconformance;
      if (!nc) continue;
      const overdueLabel = overdueDays == null ? 'con fecha objetivo no disponible' : `vencida hace ${overdueDays} día${overdueDays === 1 ? '' : 's'}`;
      alerts.push({
        id: `ca-${ca.id}`,
        title: `Acción correctiva vencida - ${ca.ca_number || ca.action_description}`,
        description: `${ca.action_description}. Relacionada a ${nc.title || 'no conformidad'} y ${overdueLabel}.`,
        severity: severityFromDays(overdueDays, severityFromPriority(nc.severity)),
        type: 'sostenibilidad',
        timestamp: sourceDate(ca.scheduled_completion_date),
        actionRequired: true,
        actionUrl: '/dashboard/sostenibilidad',
      });
    }

    const severityRank: Record<AlertSeverity, number> = { critica: 5, alta: 4, media: 3, baja: 2, info: 1 };
    alerts.sort((left, right) => {
      const severityDiff = severityRank[right.severity] - severityRank[left.severity];
      if (severityDiff !== 0) return severityDiff;
      const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : -Infinity;
      const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : -Infinity;
      return rightTime - leftTime;
    });

    return NextResponse.json({
      alerts,
      stats: {
        total: alerts.length,
        critical: alerts.filter((alert) => alert.severity === 'critica').length,
        actionRequired: alerts.filter((alert) => alert.actionRequired).length,
        stockAlerts: lowStockRows.length,
        stockItemsEvaluated: stockSource.data.evaluatedItems,
      },
      sourceStatus: {
        available: sources.length - unavailable.length,
        total: sources.length,
        complete: unavailable.length === 0,
        unavailable,
      },
      stockAlertSource: stockSource.data.dataSource,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar las alertas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
