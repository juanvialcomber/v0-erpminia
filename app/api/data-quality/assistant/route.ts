export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { routeOperationalQuery } from '@/lib/intelligence/query-router';
import {
  loadSupportAdvisoryHandoffs,
  recordSupportAdvisoryRevalidation,
  supportAdvisoryHandoffPrompt,
} from '@/lib/intelligence/advisory-handoff-context';
import { buildSkillPlan } from '@/lib/motil-ai/skills/orchestrator';
import { resolveMotilSkillAvailability } from '@/lib/motil-ai/skills/runtime-availability';
import {
  appendCoreMessage,
  archiveCoreConversation,
  conversationTranscript,
  getCoreConversationHistory,
  getCoreConversationState,
  resolveCoreConversation,
  type CoreConversationScope,
  type CoreSourceRef,
} from '@/lib/intelligence/core-conversation';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_MESSAGE_CHARS = 12000;

function extractResponseText(payload: any) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return typeof payload?.output_text === 'string' ? payload.output_text.trim() : '';
}

async function callModel(instructions: string, input: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en el servidor');
  const models = Array.from(new Set([
    process.env.OPENAI_OPERATIONAL_ASSISTANT_MODEL?.trim(),
    'gpt-5.6',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
  ].filter(Boolean))) as string[];

  let lastError = 'No hay un modelo disponible';
  for (const model of models) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions, input, reasoning: { effort: 'medium' }, max_output_tokens: 2400 }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI respondió ${response.status}`;
      lastError = detail;
      if (/invalid model|model.*not.*found|does not exist|not permitted|not available/i.test(detail)) continue;
      throw new Error(detail);
    }
    const text = extractResponseText(payload);
    if (!text) throw new Error('OpenAI no devolvió texto utilizable');
    return { text, model: payload?.model || model, responseId: payload?.id || null };
  }
  throw new Error(lastError);
}

type SourceRef = { source: string } | { tool: string; mode: 'read' };

function dataHealthScope(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>): CoreConversationScope {
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    domain: 'data_health',
  };
}

function dataHealthSourceRefs(refs: SourceRef[]): CoreSourceRef[] {
  return refs.map((ref) => ('source' in ref ? { source: ref.source } : { tool: ref.tool, mode: ref.mode }));
}

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const state = await getCoreConversationState(context.supabase, dataHealthScope(context), {
      conversationId: request.nextUrl.searchParams.get('conversationId'),
      before: request.nextUrl.searchParams.get('before'),
    });
    return NextResponse.json({
      ...state,
      sessionIdleHours: null,
      cargo: null,
      persistence: 'core_continuity_v1',
      authorizedDomains: access.domains,
    });
  } catch (error) {
    console.error('[data-quality-assistant] continuity load failed', {
      detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
    });
    return NextResponse.json({ error: 'No fue posible abrir la conversación de calidad de datos.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const scope = dataHealthScope(context);

  const body = await request.json().catch(() => null);
  if (body?.action === 'archive') {
    const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
    if (conversationId) {
      try {
        await archiveCoreConversation(context.supabase, scope, conversationId);
      } catch (error) {
        console.error('[data-quality-assistant] archive failed', {
          detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        return NextResponse.json({ error: 'No fue posible cerrar la conversación de calidad de datos.' }, { status: 500 });
      }
    }
    return NextResponse.json({ archived: Boolean(conversationId), conversationId: null, persistence: 'core_continuity_v1' });
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Escribe una consulta de calidad de datos.' }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: 'La consulta es demasiado extensa.' }, { status: 400 });

  const route = routeOperationalQuery(message, { domain: 'data_health' });

  try {
    const [conversation, skillRuntime] = await Promise.all([
      resolveCoreConversation(context.supabase, scope, {
        conversationId: typeof body?.conversationId === 'string' ? body.conversationId : null,
        firstMessage: message,
      }),
      resolveMotilSkillAvailability(context),
    ]);
    const history = await getCoreConversationHistory(context.supabase, scope, conversation.id);
    const skillPlan = buildSkillPlan(message);
    const skillState = new Map(skillRuntime.skills.map((skill) => [skill.key, skill]));
    const plannedSkills = skillPlan
      ? [skillPlan.primary, ...skillPlan.supporting].map((skill) => {
          const availability = skillState.get(skill.key);
          return {
            key: skill.key,
            name: skill.name,
            domain: skill.domain,
            state: availability?.state || 'dormant',
            missingEvidence: availability?.missingEvidence || [],
            missingSyncedData: availability?.missingSyncedData || [],
          };
        })
      : [];
    await appendCoreMessage(context.supabase, scope, {
      conversationId: conversation.id,
      role: 'user',
      content: message,
    });

    if (route.mode === 'action' || route.requiresExplicitAuthorization) {
      const answer = 'Puedo explicar la calidad, frescura y cobertura de los datos, pero este asistente no corrige, concilia ni modifica fuentes. La resolución debe realizarse en el flujo humano autorizado.';
      const persisted = await appendCoreMessage(context.supabase, scope, {
        conversationId: conversation.id,
        role: 'assistant',
        content: answer,
      });
      return NextResponse.json({
        answer,
        message: persisted,
        model: null,
        sources: [],
        toolsUsed: [],
        conversationId: conversation.id,
        route,
        persistence: 'core_continuity_v1',
        policy: 'READ_ONLY: Data Health nunca modifica la fuente canónica. El historial es contexto no canónico.',
      });
    }

    const org = context.organizationId;
    const evidence: Record<string, unknown> = {};
    const refs: SourceRef[] = [];

    if (access.canRead('production')) {
      const [checks, transport, metallurgy, drilling, fidelity] = await Promise.all([
        context.supabase.from('production_canonical_package_quality_v1').select('check_key,expected_value,actual_value,unit,source_scope,status,delta').eq('organization_id', org),
        context.supabase.from('production_material_movements').select('movement_date').eq('organization_id', org).order('movement_date', { ascending: false }).limit(1),
        context.supabase.from('production_metallurgy_deterministic_v2').select('operation_date').eq('organization_id', org).order('operation_date', { ascending: false }).limit(1),
        context.supabase.from('production_drilling_source_reports').select('operation_date').eq('organization_id', org).order('operation_date', { ascending: false }).limit(1),
        context.supabase.from('production_source_fidelity_exceptions_v1').select('domain,exception_type,source_file,source_sheet,source_row,event_date,reference_code,description').eq('organization_id', org).order('event_date', { ascending: false }).limit(60),
      ]);
      const failed = [checks, transport, metallurgy, drilling, fidelity].find((result) => result.error);
      if (failed?.error) throw failed.error;
      evidence.production = {
        quality_checks: checks.data || [],
        latest_dates: {
          transport: transport.data?.[0]?.movement_date || null,
          metallurgy: metallurgy.data?.[0]?.operation_date || null,
          drilling: drilling.data?.[0]?.operation_date || null,
        },
        source_fidelity_exceptions: fidelity.data || [],
      };
      refs.push({ source: 'production_canonical_package_quality_v1' }, { source: 'production_source_fidelity_exceptions_v1' }, { tool: 'read_data_health_production', mode: 'read' });
    }

    if (access.canRead('maintenance')) {
      const [workOrders, reviews] = await Promise.all([
        context.supabase.from('maintenance_work_orders').select('id,status,canonical_asset_id,work_order_number,title').eq('organization_id', org).limit(500),
        context.supabase.from('drilling_maintenance_review_queue_v1').select('review_id,asset_code,asset_name,operation_date,review_reason,review_status,has_linked_work_order').eq('organization_id', org).eq('review_status', 'pending').limit(100),
      ]);
      const failed = [workOrders, reviews].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const rows = workOrders.data || [];
      const closed = new Set(['completed', 'closed', 'cancelled', 'canceled']);
      const active = rows.filter((row: any) => !closed.has(String(row.status || '').toLowerCase()));
      evidence.maintenance = {
        work_orders_total: rows.length,
        active_work_orders: active.length,
        active_without_canonical_asset: active.filter((row: any) => !row.canonical_asset_id).slice(0, 100),
        pending_operational_reviews: reviews.data || [],
      };
      refs.push({ source: 'maintenance_work_orders' }, { source: 'drilling_maintenance_review_queue_v1' }, { tool: 'read_data_health_maintenance', mode: 'read' });
    }

    if (access.canRead('inventory')) {
      const [overview, snapshot] = await Promise.all([
        context.supabase.from('inventory_intelligence_overview_v1').select('*').eq('organization_id', org).maybeSingle(),
        context.supabase.from('canonical_inventory_current').select('snapshot_date').eq('organization_id', org).order('snapshot_date', { ascending: false }).limit(1),
      ]);
      if (overview.error || snapshot.error) throw overview.error || snapshot.error;
      evidence.inventory = {
        latest_snapshot_date: snapshot.data?.[0]?.snapshot_date || null,
        overview: overview.data || null,
      };
      refs.push({ source: 'inventory_intelligence_overview_v1' }, { source: 'canonical_inventory_current' }, { tool: 'read_data_health_inventory', mode: 'read' });
    }

    if (access.canRead('procurement')) {
      const [quality, exceptions, supplierReconciliation] = await Promise.all([
        context.supabase.from('purchase_order_quality').select('order_number,order_date,supplier_name,warning_line_count,quality_status,net_amount_variance').eq('organization_id', org).neq('quality_status', 'valid').order('order_date', { ascending: false }).limit(100),
        context.supabase.from('procurement_match_exceptions').select('status').eq('organization_id', org),
        context.supabase.from('supplier_reconciliation_v1').select('source_supplier_name,match_status,match_confidence,match_notes').eq('organization_id', org).eq('match_status', 'pending').limit(100),
      ]);
      const failed = [quality, exceptions, supplierReconciliation].find((result) => result.error);
      if (failed?.error) throw failed.error;
      evidence.procurement = {
        purchase_order_quality_warnings: quality.data || [],
        open_match_exceptions: (exceptions.data || []).filter((row: any) => !['resolved', 'closed', 'ignored'].includes(String(row.status || '').toLowerCase())).length,
        supplier_reconciliation_pending: supplierReconciliation.data || [],
      };
      refs.push({ source: 'purchase_order_quality' }, { source: 'supplier_reconciliation_v1' }, { tool: 'read_data_health_procurement', mode: 'read' });
    }


    if (access.canRead('hse')) {
      const [documents, commitments, internalInspections, externalInspections] = await Promise.all([
        context.supabase.from('module_documents').select('id,document_name,uploaded_at,provenance_status').eq('organization_id', org).eq('module', 'prevención').eq('category', 'documentos-hse').eq('provenance_status', 'canonical').eq('is_active', true).limit(200),
        context.supabase.from('hse_commitments').select('id,description,responsible,source_file,source_payload').eq('organization_id', org).limit(200),
        context.supabase.from('inspecciones_internas').select('id,numero_inspeccion,fecha_planificada,estado').eq('organization_id', org).limit(100),
        context.supabase.from('inspecciones_externas').select('id,numero_inspeccion,fecha_planificada,estado').eq('organization_id', org).limit(100),
      ]);
      const failed = [documents, commitments, internalInspections, externalInspections].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const commitmentRows = commitments.data || [];
      evidence.hse = {
        canonical_documents: documents.data || [],
        commitments_total: commitmentRows.length,
        commitments_with_normalization_gap: commitmentRows.filter((row: any) => {
          const payload = row.source_payload || {};
          return (String(payload['COMPROMISOS AMBIENTALES'] || '').trim() && !String(row.description || '').trim())
            || (String(payload['RESPONSABLE'] || '').trim() && !String(row.responsible || '').trim());
        }).length,
        internal_inspections: internalInspections.data || [],
        external_inspections: externalInspections.data || [],
      };
      refs.push({ source: 'module_documents' }, { source: 'hse_commitments' }, { tool: 'read_data_health_hse', mode: 'read' });
    }

    if (access.canRead('legal')) {
      const cases = await context.supabase
        .from('legal_cases')
        .select('id,title,status,priority,legal_owner,operational_owner,due_at,source_type,source_id,evidence_status')
        .eq('organization_id', org)
        .limit(200);
      if (cases.error) throw cases.error;
      const rows = cases.data || [];
      evidence.legal = {
        cases_total: rows.length,
        open_cases: rows.filter((row: any) => row.status !== 'closed'),
        missing_legal_owner: rows.filter((row: any) => row.status !== 'closed' && !row.legal_owner).length,
        missing_due_date: rows.filter((row: any) => row.status !== 'closed' && !row.due_at).length,
      };
      refs.push({ source: 'legal_cases' }, { tool: 'read_data_health_legal', mode: 'read' });
    }

    if (access.canRead('finance')) {
      const payables = await context.supabase
        .from('procurement_accounts_payable')
        .select('id,status,due_date,invoice_id,supplier_id,currency,approved_amount')
        .eq('organization_id', org)
        .limit(200);
      if (payables.error) throw payables.error;
      const rows = payables.data || [];
      evidence.finance = {
        payables_total: rows.length,
        missing_due_date: rows.filter((row: any) => !row.due_date).length,
        missing_invoice_reference: rows.filter((row: any) => !row.invoice_id).length,
        missing_supplier_reference: rows.filter((row: any) => !row.supplier_id).length,
      };
      refs.push({ source: 'procurement_accounts_payable' }, { tool: 'read_data_health_finance', mode: 'read' });
    }

    const advisoryHandoffs = await loadSupportAdvisoryHandoffs(context, 'data_health', message);
    const advisoryContext = supportAdvisoryHandoffPrompt(
      advisoryHandoffs,
      'Una advertencia, inconsistencia o diagnóstico previo nunca representa la calidad, frescura, cobertura o conciliación actual. Si las fuentes actuales contradicen el caso, indícalo y prioriza la evidencia actual.',
    );

    const instructions = `Eres el especialista de Calidad de Datos dentro de MOTIL Intelligence Core. Tu función es explicar si una conclusión operacional puede confiar en sus fuentes y qué evidencia falta para mejorarla.\n\nREGLAS:\n1. Usa sólo EVIDENCIA MOTIL y sólo los dominios autorizados presentes para afirmar calidad, frescura, cobertura, conciliación o inconsistencia.\n2. HISTORIAL CONVERSACIONAL es contexto NO CANÓNICO. Puede ayudarte a entender qué fuente, problema o comparación quiere revisar el usuario, pero una advertencia o diagnóstico previo nunca representa el estado actual sin nueva evidencia MOTIL.\n3. HANDOFF ADVISORY es contexto NO CANÓNICO: sólo define qué revalidar. Nunca transforma un warning, diagnóstico o inconsistencia previa en estado actual.\n4. Diferencia calidad, frescura, cobertura, conciliación e inconsistencia. No conviertas ausencia de datos en una conclusión operacional.\n5. Una fuente atrasada puede seguir siendo válida históricamente, pero no representa el estado actual. Declara las fechas de corte cuando sean relevantes.\n6. Un warning, excepción o cola de revisión no es automáticamente un error operativo ni una causa raíz.\n7. Nunca expongas datos de dominios no incluidos en EVIDENCIA MOTIL ni insinúes que conoces su estado.\n8. No corrijas ni modifiques datos, no fusiones registros y no cierres revisiones. Recomienda la validación humana mínima necesaria.\n9. Responde en formato operativo: Dato canónico → impacto en confiabilidad → evidencia faltante → siguiente validación.\n10. Mantén la respuesta breve y específica. No muestres JSON crudo.
11. PLAN DE SKILLS es orientación interna, no evidencia. Una skill AVAILABLE puede orientar la revisión; una DEGRADED sólo explica qué falta; una DORMANT no debe presentarse como disponible.
12. Ninguna skill amplía permisos, cambia la fuente ni cierra una revisión por sí sola.`;

    const result = await callModel(
      instructions,
      `DOMINIOS AUTORIZADOS\n${JSON.stringify(access.domains)}\n\nHISTORIAL CONVERSACIONAL NO CANÓNICO\n${conversationTranscript(history)}\n\n${advisoryContext}\n\nPLAN DE SKILLS NO CANÓNICO\n${JSON.stringify(plannedSkills)}\n\nEVIDENCIA MOTIL CANÓNICA/AUTORIZADA\n${JSON.stringify(evidence)}\n\nPREGUNTA\n${message}`,
    );
    const sources = refs.filter((ref): ref is { source: string } => 'source' in ref).map((ref) => ref.source);
    const toolsUsed = refs.filter((ref): ref is { tool: string; mode: 'read' } => 'tool' in ref).map((ref) => ({ name: ref.tool, mode: ref.mode }));
    const canonicalRefs = dataHealthSourceRefs(refs);

    const persisted = await appendCoreMessage(context.supabase, scope, {
      conversationId: conversation.id,
      role: 'assistant',
      content: result.text,
      sourceRefs: canonicalRefs,
      model: result.model,
    });

    let decisionCaseRevalidation = { updated: 0, at: null as string | null };
    if (persisted && advisoryHandoffs.length && canonicalRefs.length) {
      try {
        decisionCaseRevalidation = await recordSupportAdvisoryRevalidation(
          context,
          'data_health',
          advisoryHandoffs,
          canonicalRefs,
        );
      } catch (error) {
        console.warn('[data-quality-assistant] advisory revalidation metadata skipped', {
          detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
      }
    }

    return NextResponse.json({
      answer: result.text,
      message: persisted,
      model: result.model,
      responseId: result.responseId,
      sources,
      toolsUsed,
      conversationId: conversation.id,
      decisionCaseRefs: advisoryHandoffs.map((row) => row.id),
      decisionCaseRevalidation,
      route,
      authorizedDomains: access.domains,
      skillPlan: plannedSkills,
      skillSummary: skillRuntime.summary,
      persistence: 'core_continuity_v1',
      policy: 'READ_ONLY + permission-aware: calidad/frescura/cobertura sólo sobre dominios que el usuario puede leer. Historial y Decision Cases son contexto no canónico separado de evidencia.',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
    const configurationError = detail.includes('OPENAI_API_KEY');
    console.error('[data-quality-assistant] request failed', { detail });
    return NextResponse.json({
      error: configurationError ? 'El servicio de IA no está configurado en este entorno.' : 'No fue posible analizar la calidad de datos.',
    }, { status: configurationError ? 503 : 500 });
  }
}
