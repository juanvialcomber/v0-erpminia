export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { financeAmount, financeStatusLabel, maintenancePriorityLabel } from '@/lib/finance-ui-labels';
import {
  MODULE_KEYS,
  getModuleAccessLevel,
  requireModuleAccess,
  type ModuleKey,
} from '@/lib/api/module-access';

type CoverageDomain = 'production' | 'maintenance' | 'procurement';

type DomainConfig = {
  moduleKey: ModuleKey;
  table: string;
  select: string;
};

const DOMAIN_CONFIG: Record<CoverageDomain, DomainConfig> = {
  production: {
    moduleKey: MODULE_KEYS.PROD_OPERACIONES,
    table: 'production_mine_sources',
    select: 'id,code,name,status,cost_center_id,updated_at',
  },
  maintenance: {
    moduleKey: MODULE_KEYS.MANT_OPERACIONES,
    table: 'maintenance_work_orders',
    select: 'id,work_order_number,title,status,priority,cost_center_id,updated_at',
  },
  procurement: {
    moduleKey: MODULE_KEYS.FIN_COMPRAS,
    table: 'procurement_operational_orders',
    select: 'id,order_number,status,total_amount,currency,work_order_id,cost_center_id,updated_at',
  },
};

function canRead(level: string) {
  return level === 'ED' || level === 'LEC';
}

function labelRow(domain: CoverageDomain, row: Record<string, unknown>) {
  if (domain === 'production') {
    return {
      code: String(row.code || ''),
      label: String(row.name || row.code || 'Fuente de mina'),
      detail: financeStatusLabel(row.status, 'production'),
    };
  }
  if (domain === 'maintenance') {
    return {
      code: String(row.work_order_number || ''),
      label: String(row.title || row.work_order_number || 'Orden de trabajo'),
      detail: [financeStatusLabel(row.status, 'maintenance'), row.priority ? maintenancePriorityLabel(row.priority) : null]
        .filter(Boolean)
        .join(' · '),
    };
  }
  const amount = Number(row.total_amount || 0);
  return {
    code: String(row.order_number || ''),
    label: String(row.order_number || 'Orden de compra'),
    detail: `${financeStatusLabel(row.status, 'procurement')}${amount ? ` · ${financeAmount(amount, String(row.currency || 'CLP'))}` : ''}`,
  };
}

export async function GET(request: NextRequest) {
  const costCenterAccess = await requireModuleAccess(request, MODULE_KEYS.CORE_CENTROS_COSTOS);
  if (!costCenterAccess.authorized) return costCenterAccess.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const entries = await Promise.all(
      (Object.entries(DOMAIN_CONFIG) as Array<[CoverageDomain, DomainConfig]>).map(async ([domain, config]) => {
        const accessLevel = await getModuleAccessLevel(context.userId, context.role, config.moduleKey);
        if (!canRead(accessLevel)) {
          return { domain, accessLevel, rows: [] as Record<string, unknown>[] };
        }

        const { data, error } = await context.supabase
          .from(config.table)
          .select(config.select)
          .eq('organization_id', context.organizationId)
          .is('cost_center_id', null)
          .order('updated_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        return {
          domain,
          accessLevel,
          rows: (data || []) as unknown as Record<string, unknown>[],
        };
      }),
    );

    const rows = entries.flatMap(({ domain, accessLevel, rows }) =>
      rows.map((row) => ({
        id: String(row.id),
        domain,
        canAssign: accessLevel === 'ED' && costCenterAccess.canWrite,
        ...labelRow(domain, row),
      })),
    );

    return NextResponse.json({
      rows,
      summary: {
        total: rows.length,
        production: rows.filter((row) => row.domain === 'production').length,
        maintenance: rows.filter((row) => row.domain === 'maintenance').length,
        procurement: rows.filter((row) => row.domain === 'procurement').length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo calcular la cobertura de centros de costo';
    console.error('[cost-centers/coverage:get]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const costCenterAccess = await requireModuleAccess(request, MODULE_KEYS.CORE_CENTROS_COSTOS, true);
  if (!costCenterAccess.authorized) return costCenterAccess.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const domain = String(body?.domain || '') as CoverageDomain;
  const recordId = String(body?.recordId || '').trim();
  const costCenterId = String(body?.costCenterId || '').trim();
  const config = DOMAIN_CONFIG[domain];

  if (!config || !recordId || !costCenterId) {
    return NextResponse.json({ error: 'Dominio, registro y centro de costo son obligatorios' }, { status: 400 });
  }

  const ownerAccess = await requireModuleAccess(request, config.moduleKey, true);
  if (!ownerAccess.authorized) return ownerAccess.response;

  try {
    const { data: costCenter, error: costCenterError } = await context.supabase
      .from('canonical_cost_centers_current')
      .select('id,cost_center_code,name,is_active')
      .eq('organization_id', context.organizationId)
      .eq('id', costCenterId)
      .eq('is_active', true)
      .maybeSingle();
    if (costCenterError) throw costCenterError;
    if (!costCenter) {
      return NextResponse.json({ error: 'Centro de costo no encontrado o inactivo' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await context.supabase
      .from(config.table)
      .update({ cost_center_id: costCenterId, updated_at: new Date().toISOString() })
      .eq('organization_id', context.organizationId)
      .eq('id', recordId)
      .is('cost_center_id', null)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json({ error: 'El registro ya fue asignado o no pertenece a esta organización' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      domain,
      recordId,
      costCenter: {
        id: costCenter.id,
        code: costCenter.cost_center_code,
        name: costCenter.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo asignar el centro de costo';
    console.error('[cost-centers/coverage:post]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
