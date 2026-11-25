export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getOrganizationContext } from '@/lib/api/organization-context';
import {
  getUserModuleAccess,
  isAdminRole,
  MODULE_KEYS,
  requireModuleAccess,
} from '@/lib/api/module-access';

type Decision = 'approve' | 'reject';
const invoiceActions: Record<string,string> = {
  invoice_difference: 'Contrastar documento original, moneda y total.',
  payment_difference: 'Contrastar comprobantes de pago y saldo pendiente.',
  ambiguous: 'Verificar identidad y tipo de documento antes de vincular.',
  approval_missing: 'Verificar la obligación y su aprobación.',
  currency_missing: 'Verificar moneda en el documento fuente.',
  identity_missing: 'Completar RUT y folio desde el documento fuente.',
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

async function financeDecisionAuthority(userId: string, role?: string | null) {
  if (isAdminRole(role)) return { allowed: true, projectLead: false };
  const access = await getUserModuleAccess(userId);
  const cargo = normalize(access.cargoName);
  return {
    allowed: cargo === 'gerente de finanzas' || cargo === 'jefe de planificación',
    projectLead: cargo === 'jefe de planificación',
  };
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

  const view = request.nextUrl.searchParams.get('view') ?? 'open';
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
  if (!['open','history'].includes(view) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json({ error: 'Selección inválida.' }, { status: 400 });
  }
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    if (view === 'history') {
      const authority = await financeDecisionAuthority(context.userId, context.role);
      if (!authority.allowed || !access.canWrite) return NextResponse.json({ error: 'Sin acceso al historial de decisiones.' }, { status: 403, headers });
      const { data: history, count, error: historyError } = await context.supabase
        .from('data_reconciliation_reviews')
        .select('id,issue_type,status,evidence_reference,resolution_note,reviewed_at,updated_at', { count: 'exact' })
        .eq('organization_id', context.organizationId)
        .in('status', ['accepted','ignored','resolved'])
        .or('issue_key.like.laudus:cxp_inconsistente:%,issue_key.like.laudus:open_invoice_trace_once:%,issue_key.like.laudus:purchase_order_unresolved:%,issue_key.like.laudus:cost_center_pending:%,issue_key.like.laudus:invoice_discrepancy:%')
        .order('updated_at', { ascending: false })
        .order('id')
        .range((page - 1) * 25, page * 25 - 1);
      if (historyError || count === null) throw historyError ?? new Error('Missing history count');
      return NextResponse.json({ rows: history ?? [], total: count, page }, { headers });
    }
    const { data: rows, error, count } = await context.supabase
      .from('data_reconciliation_reviews')
      .select('id,issue_key,entity_type,entity_id,issue_type,evidence_reference,created_at,updated_at', { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .eq('status', 'open')
      .or('issue_key.like.laudus:cxp_inconsistente:%,issue_key.like.laudus:open_invoice_trace_once:%,issue_key.like.laudus:purchase_order_unresolved:%,issue_key.like.laudus:cost_center_pending:%,issue_key.like.laudus:invoice_discrepancy:%')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const authority = await financeDecisionAuthority(context.userId, context.role);
    const canDecide = access.canWrite && authority.allowed;

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
        currentUser: authority.projectLead,
        canDecide: authority.projectLead && canDecide,
        scope: 'Sólo conciliaciones Laudus; no amplía acceso general a Finanzas.',
      },
      summary: {
        pending: count ?? (rows || []).length,
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
    }, { headers });
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

  const authority = await financeDecisionAuthority(context.userId, context.role);
  if (!access.canWrite || !authority.allowed) {
    return NextResponse.json(
      { error: 'Sólo Administración y Finanzas, el Jefe de Planificación como líder del proyecto o un administrador puede resolver esta conciliación.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (body?.action === 'register_invoice_group') {
    const group = body.group;
    if (typeof group !== 'string' || !Object.hasOwn(invoiceActions, group)) {
      return NextResponse.json({ error: 'Grupo de revisión inválido.' }, { status: 400 });
    }
    // Only the finance owner (or an authorized administrator) may create invoice cases.
    const finance = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
    if (!finance.authorized || !finance.canWrite || authority.projectLead) {
      return NextResponse.json({ error: 'Sin permiso para registrar casos financieros.' }, { status: 403 });
    }
    try {
      const { data: comparison, error: comparisonError } = await context.supabase.rpc('motil_invoice_reconciliation_v1', {
        p_organization_id: context.organizationId, p_status: group, p_offset: 0, p_limit: 100,
      });
      if (comparisonError || !comparison || !Array.isArray(comparison.rows) || !Number.isSafeInteger(comparison.total) || comparison.total < 0) {
        return NextResponse.json({ error: 'No se pudo verificar la fuente.' }, { status: 503 });
      }
      // Refuse partial batches; do not silently register only the first page.
      if (comparison.total > 100 || comparison.rows.length !== comparison.total) {
        return NextResponse.json({ error: 'El grupo requiere revisión por lotes antes de registrarse.' }, { status: 409 });
      }
      const rows = new Map<string, { organization_id:string; issue_key:string; entity_type:string; issue_type:string; evidence_reference:string; status:string }>();
      for (const row of comparison.rows) {
        if (!row || row.status !== group || (!row.laudus_id && !row.motil_invoice_id)) {
          return NextResponse.json({ error: 'La evidencia contiene registros sin identidad verificable.' }, { status: 409 });
        }
        const key = 'laudus:invoice_discrepancy:' + group + ':' + createHash('sha256').update(JSON.stringify([row.laudus_id ?? null,row.motil_invoice_id ?? null])).digest('hex');
        rows.set(key, {
          organization_id: context.organizationId, issue_key:key, entity_type:'invoice',
          issue_type:invoiceActions[group], status:'open',
          evidence_reference:JSON.stringify({ source:'motil_invoice_reconciliation_v1', group, laudus_id:row.laudus_id ?? null, motil_invoice_id:row.motil_invoice_id ?? null, folio:row.folio ?? null, rut:row.rut ?? null, supplier_name:row.supplier_name ?? null, laudus_currency:row.laudus_currency ?? null, motil_currency:row.motil_currency ?? null, laudus_total:row.laudus_total ?? null, motil_total:row.motil_total ?? null, laudus_balance:row.laudus_balance ?? null, motil_balance:row.motil_balance ?? null, laudus_synced_at:row.laudus_synced_at ?? null, registered_by:context.userId, registered_at:new Date().toISOString() }),
        });
      }
      if (!rows.size) return NextResponse.json({ created:0, existing:0, verified:0 });
      const { data: inserted, error: insertError } = await context.supabase.from('data_reconciliation_reviews')
        .upsert([...rows.values()], { onConflict:'organization_id,issue_key', ignoreDuplicates:true }).select('id');
      if (insertError || !Array.isArray(inserted)) throw insertError ?? new Error('Missing insertion receipt');
      return NextResponse.json({ created:inserted.length, existing:rows.size-inserted.length, verified:rows.size }, { headers:{'Cache-Control':'private, no-store'} });
    } catch {
      return NextResponse.json({ error:'No se pudo registrar el grupo de revisión.' }, { status:503 });
    }
  }
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
      String(review.issue_key).startsWith('laudus:cost_center_pending:') ||
      String(review.issue_key).startsWith('laudus:invoice_discrepancy:');

    if (!valid) return NextResponse.json({ error: 'La conciliación no pertenece a Administración y Finanzas.' }, { status: 400 });

    const status = decision === 'approve' ? 'accepted' : 'ignored';
    const actor = context.userName || context.userEmail || context.userId;
    const resolutionNote = [
      `decision=${decision}`,
      'area=administracion_finanzas',
      `authority=${authority.projectLead ? 'project_lead' : 'area_owner'}`,
      `actor=${actor}`,
      `reason=${reason}`,
      'canonical_mutation=false',
      'laudus_mutation=false',
    ].join(' | ');

    const { data: updatedReview, error: updateError } = await context.supabase
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
      .eq('status', 'open')
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedReview) return NextResponse.json({ error: 'Otra persona ya revisó este caso. Actualiza la bandeja.' }, { status: 409 });

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
