export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import {
  getUserModuleAccess,
  isAdminRole,
  MODULE_KEYS,
  requireModuleAccess,
} from '@/lib/api/module-access';

type Decision = 'approve' | 'reject';

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

async function canDecideFinance(userId: string, role?: string | null) {
  if (isAdminRole(role)) return true;
  const access = await getUserModuleAccess(userId);
  const cargo = normalize(access.cargoName);
  return cargo === 'gerente de finanzas' || cargo === 'jefe de planificación';
}

async function requireFinanceReconciliationAccess(request: NextRequest) {
  const finance = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (finance.authorized) return finance;

  const projectLead = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!projectLead.authorized || !projectLead.canWrite) return finance;

  const access = await getUserModuleAccess(projectLead.user.id);
  if (normalize(access.cargoName) !== 'jefe de planificación') return finance;

  return projectLead;
}

export async function GET(request: NextRequest) {
  const access = await requireFinanceReconciliationAccess(request);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data: rows, error } = await context.supabase
      .from('data_reconciliation_reviews')
      .select('id,issue_key,entity_type,entity_id,issue_type,evidence_reference,created_at,updated_at')
      .eq('organization_id', context.organizationId)
      .eq('status', 'open')
      .or('issue_key.like.laudus:cxp_inconsistente:%,issue_key.like.laudus:open_invoice_trace_once:%,issue_key.like.laudus:purchase_order_unresolved:%,issue_key.like.laudus:cost_center_pending:%')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const canDecide = access.canWrite && await canDecideFinance(context.userId, context.role);

    return NextResponse.json({
      rows: (rows || []).map((row) => ({
        id: row.id,
        issueKey: row.issue_key,
        entityType: row.entity_type,
        entityId: row.entity_id,
        issueType: row.issue_type,
        evidenceReference: row.evidence_reference,
        updatedAt: row.updated_at,
        kind: String(row.issue_key).startsWith('laudus:cxp_inconsistente:')
          ? 'accounts_payable_inconsistency'
          : String(row.issue_key).startsWith('laudus:purchase_order_unresolved:')
            ? 'purchase_order_reconciliation'
            : String(row.issue_key).startsWith('laudus:cost_center_pending:')
              ? 'cost_center_reconciliation'
              : 'invoice_trace',
      })),
      canDecide,
      owner: {
        cargo: 'Gerente de Finanzas',
        area: 'Administración y Finanzas',
      },
      projectLead: {
        cargo: 'Jefe de Planificación',
        canDecide,
        scope: 'Sólo conciliaciones Laudus; no amplía acceso general a Finanzas.',
      },
      summary: {
        pending: (rows || []).length,
        accountsPayable: (rows || []).filter((row) => String(row.issue_key).startsWith('laudus:cxp_inconsistente:')).length,
        purchaseOrders: (rows || []).filter((row) => String(row.issue_key).startsWith('laudus:purchase_order_unresolved:')).length,
        costCenters: (rows || []).filter((row) => String(row.issue_key).startsWith('laudus:cost_center_pending:')).length,
        trace: (rows || []).filter((row) => String(row.issue_key).startsWith('laudus:open_invoice_trace_once:')).length,
      },
      policy: {
        reasonRequired: true,
        canonicalMutation: false,
        laudusMutation: false,
      },
    });
  } catch (error) {
    console.error('[laudus/finance-reconciliation-review][GET]', error);
    return NextResponse.json({ error: 'No fue posible cargar la conciliación financiera.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireFinanceReconciliationAccess(request);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  if (!access.canWrite || !(await canDecideFinance(context.userId, context.role))) {
    return NextResponse.json(
      { error: 'Sólo Administración y Finanzas, el Jefe de Planificación como líder del proyecto o un administrador puede resolver esta conciliación.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const reviewId = String(body?.reviewId || '').trim();
  const decision = String(body?.decision || '').trim() as Decision;
  const reason = String(body?.reason || '').trim();

  if (!reviewId || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Debes registrar una razón concreta para aprobar o rechazar.' }, { status: 400 });
  }

  try {
    const { data: review, error: loadError } = await context.supabase
      .from('data_reconciliation_reviews')
      .select('id,issue_key,status')
      .eq('organization_id', context.organizationId)
      .eq('id', reviewId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!review) return NextResponse.json({ error: 'Conciliación no encontrada.' }, { status: 404 });
    if (review.status !== 'open') return NextResponse.json({ error: 'Esta conciliación ya fue resuelta.' }, { status: 409 });

    const valid =
      String(review.issue_key).startsWith('laudus:cxp_inconsistente:') ||
      String(review.issue_key).startsWith('laudus:open_invoice_trace_once:') ||
      String(review.issue_key).startsWith('laudus:purchase_order_unresolved:') ||
      String(review.issue_key).startsWith('laudus:cost_center_pending:');

    if (!valid) return NextResponse.json({ error: 'La conciliación no pertenece a Administración y Finanzas.' }, { status: 400 });

    const status = decision === 'approve' ? 'accepted' : 'ignored';
    const actor = context.userName || context.userEmail || context.userId;
    const resolutionNote = [
      `decision=${decision}`,
      'area=administracion_finanzas',
      `actor=${actor}`,
      `reason=${reason}`,
      'canonical_mutation=false',
      'laudus_mutation=false',
    ].join(' | ');

    const { error: updateError } = await context.supabase
      .from('data_reconciliation_reviews')
      .update({
        status,
        resolution_note: resolutionNote,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', context.organizationId)
      .eq('id', reviewId)
      .eq('status', 'open');

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      reviewId,
      decision,
      status,
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
    });
  } catch (error) {
    console.error('[laudus/finance-reconciliation-review][POST]', error);
    return NextResponse.json({ error: 'No fue posible registrar la decisión financiera.' }, { status: 500 });
  }
}
