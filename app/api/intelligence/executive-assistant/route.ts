export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveExecutiveAccess } from '@/lib/intelligence/executive-access';
import { routeOperationalQuery } from '@/lib/intelligence/query-router';
import { loadExecutiveGovernedMemory } from '@/lib/intelligence/executive-governed-memory';
import { loadRegulatoryIntelligenceContext } from '@/lib/intelligence/regulatory-intelligence-context';
import { evaluateGroundedCoreResponse } from '@/lib/intelligence/core-grounded-evaluation';
import { buildSkillPlan } from '@/lib/motil-ai/skills/orchestrator';
import { resolveMotilSkillAvailability } from '@/lib/motil-ai/skills/runtime-availability';
import { recordCoreRuntimeError } from '@/lib/intelligence/core-error-observability';
import {
  loadEquipmentIntelligenceContext,
  resolveEquipmentMention,
  type EquipmentIntelligenceContext,
} from '@/lib/intelligence/equipment-intelligence-context';
import {
  loadSupportAdvisoryHandoffs,
  recordSupportAdvisoryRevalidation,
  supportAdvisoryHandoffPrompt,
} from '@/lib/intelligence/advisory-handoff-context';
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
      body: JSON.stringify({ model, instructions, input, reasoning: { effort: 'medium' }, max_output_tokens: 2600 }),
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

type ToolRef = { name: string; mode: 'read' };

function executiveScope(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>): CoreConversationScope {
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    domain: 'executive',
  };
}

function sourceRefs(sources: Set<string>, toolsUsed: ToolRef[]): CoreSourceRef[] {
  return [
    ...Array.from(sources).map((source) => ({ source })),
    ...toolsUsed.map((tool) => ({ tool: tool.name, mode: tool.mode })),
  ];
}

export async function GET(request: NextRequest) {
  const access = await resolveExecutiveAccess(request);
  if (!access.ok) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const state = await getCoreConversationState(context.supabase, executiveScope(context), {
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
    console.error('[executive-assistant] continuity load failed', {
      detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
    });
    return NextResponse.json({ error: 'No fue posible abrir la conversación ejecutiva.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await resolveExecutiveAccess(request);
  if (!access.ok) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const scope = executiveScope(context);

  const body = await request.json().catch(() => null);
  if (body?.action === 'archive') {
    const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
    if (conversationId) {
      try {
        await archiveCoreConversation(context.supabase, scope, conversationId);
      } catch (error) {
        console.error('[executive-assistant] archive failed', {
          detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        return NextResponse.json({ error: 'No fue posible cerrar la conversación.' }, { status: 500 });
      }
    }
    return NextResponse.json({ archived: Boolean(conversationId), conversationId: null, persistence: 'core_continuity_v1' });
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Escribe una consulta ejecutiva.' }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: 'La consulta es demasiado extensa.' }, { status: 400 });

  const route = routeOperationalQuery(message, { domain: 'executive' });

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
      const answer = 'Puedo priorizar evidencia y preparar una recomendación ejecutiva, pero el Centro Ejecutivo conversacional no ejecuta aprobaciones, compras, cierres, ajustes ni otras mutaciones. La decisión debe confirmarse en el flujo autorizado.';
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
        policy: 'READ_ONLY: síntesis ejecutiva sin bypass de permisos ni acciones. El historial es contexto no canónico.',
      });
    }

    const org = context.organizationId;
    const evidence: Record<string, unknown> = {};
    const sources = new Set<string>();
    const toolsUsed: ToolRef[] = [];
    let equipmentContext: EquipmentIntelligenceContext | null = null;

    if (access.canRead('production')) {
      const [flow, fidelity, drilling] = await Promise.all([
        context.supabase
          .from('production_fine_flow_daily_v1')
          .select('operation_date,transported_wet_metric_tons,treated_wet_metric_tons,recovered_fine_cu_metric_tons,fine_coverage_state,transport_treatment_delta_metric_tons,flow_state')
          .eq('organization_id', org)
          .order('operation_date', { ascending: false })
          .limit(31),
        context.supabase
          .from('production_source_fidelity_exceptions_v1')
          .select('domain,exception_type,event_date,reference_code,description')
          .eq('organization_id', org)
          .order('event_date', { ascending: false })
          .limit(40),
        context.supabase
          .from('production_drilling_operational_summary_v1')
          .select('*')
          .eq('organization_id', org)
          .maybeSingle(),
      ]);
      const failed = [flow, fidelity, drilling].find((result) => result.error);
      if (failed?.error) throw failed.error;
      evidence.production = {
        freshness: {
          flow_through: flow.data?.[0]?.operation_date || null,
          drilling_through: drilling.data?.max_date || null,
        },
        recent_flow: flow.data || [],
        source_fidelity_exceptions: fidelity.data || [],
        drilling_summary: drilling.data || null,
      };
      ['production_fine_flow_daily_v1', 'production_source_fidelity_exceptions_v1', 'production_drilling_operational_summary_v1'].forEach((source) => sources.add(source));
      toolsUsed.push({ name: 'read_executive_production', mode: 'read' });
    }

    if (access.canRead('maintenance')) {
      const [workOrders, reviews, preventive] = await Promise.all([
        context.supabase
          .from('maintenance_work_orders')
          .select('id,work_order_number,canonical_asset_id,title,status,priority,scheduled_date,completion_date,down_time_hours,external_cost')
          .eq('organization_id', org)
          .order('created_at', { ascending: false })
          .limit(120),
        context.supabase
          .from('drilling_maintenance_review_queue_v1')
          .select('review_id,asset_code,asset_name,operation_date,review_reason,review_status,has_linked_work_order')
          .eq('organization_id', org)
          .eq('review_status', 'pending')
          .limit(60),
        context.supabase
          .from('preventive_maintenance_hour_status_v1')
          .select('asset_code,asset_name,task_name,hour_status,remaining_hours,meter_basis_conflict,generated_work_order_id')
          .eq('organization_id', org)
          .limit(100),
      ]);
      const failed = [workOrders, reviews, preventive].find((result) => result.error);
      if (failed?.error) throw failed.error;
      evidence.maintenance = {
        work_orders: workOrders.data || [],
        pending_operational_reviews: reviews.data || [],
        preventive_hour_status: preventive.data || [],
      };
      ['maintenance_work_orders', 'drilling_maintenance_review_queue_v1', 'preventive_maintenance_hour_status_v1'].forEach((source) => sources.add(source));
      toolsUsed.push({ name: 'read_executive_maintenance', mode: 'read' });

      const equipment = await resolveEquipmentMention(context, message);
      if (equipment?.id) {
        const loadedEquipment = await loadEquipmentIntelligenceContext(context, String(equipment.id));
        if (loadedEquipment.available) {
          equipmentContext = loadedEquipment;
          evidence.equipment = {
            asset: loadedEquipment.asset,
            operational: loadedEquipment.operational,
            decisionCases: loadedEquipment.decisionCases,
          };
          loadedEquipment.sources.forEach((source) => sources.add(source));
          toolsUsed.push({ name: 'read_equipment_intelligence', mode: 'read' });
        }
      }
    }

    if (access.canRead('inventory')) {
      const [overview, snapshot] = await Promise.all([
        context.supabase.from('inventory_intelligence_overview_v1').select('*').eq('organization_id', org).maybeSingle(),
        context.supabase.from('canonical_inventory_current').select('snapshot_date').eq('organization_id', org).order('snapshot_date', { ascending: false }).limit(1),
      ]);
      if (overview.error || snapshot.error) throw overview.error || snapshot.error;
      evidence.inventory = {
        freshness: { snapshot_date: snapshot.data?.[0]?.snapshot_date || null },
        overview: overview.data || null,
      };
      sources.add('inventory_intelligence_overview_v1');
      sources.add('canonical_inventory_current');
      toolsUsed.push({ name: 'read_executive_inventory', mode: 'read' });
    }

    if (access.canRead('procurement')) {
      const [overview, recent, quality] = await Promise.all([
        context.supabase.from('procurement_overview').select('*').eq('organization_id', org).maybeSingle(),
        context.supabase
          .from('canonical_purchase_orders_current')
          .select('po_number,vendor_name,item_code,item_description,total_amount,order_date,status,updated_at,cost_center_code')
          .eq('organization_id', org)
          .order('order_date', { ascending: false })
          .limit(50),
        context.supabase
          .from('purchase_order_quality')
          .select('order_number,order_date,supplier_name,warning_line_count,quality_status,net_amount_variance')
          .eq('organization_id', org)
          .neq('quality_status', 'valid')
          .order('order_date', { ascending: false })
          .limit(30),
      ]);
      const failed = [overview, recent, quality].find((result) => result.error);
      if (failed?.error) throw failed.error;
      evidence.procurement = {
        freshness: { latest_order_date: recent.data?.[0]?.order_date || overview.data?.last_purchase_date || null },
        overview: overview.data || null,
        recent_orders: recent.data || [],
        quality_warnings: quality.data || [],
      };
      ['procurement_overview', 'canonical_purchase_orders_current', 'purchase_order_quality'].forEach((source) => sources.add(source));
      toolsUsed.push({ name: 'read_executive_procurement', mode: 'read' });
    }

    const canReadMaintenance = access.canRead('maintenance');
    const canReadInventory = access.canRead('inventory');
    const canReadProcurement = access.canRead('procurement');

    if (canReadMaintenance && canReadInventory && canReadProcurement) {
      const supplyChain = await context.supabase
        .from('work_order_supply_chain_v1')
        .select('work_order_id,work_order_number,canonical_asset_id,title,work_order_status,priority,scheduled_date,material_requirement_count,material_shortage_count,material_shortage_quantity,supply_need_count,open_supply_need_count,supply_needs_with_request,procurement_request_count,open_procurement_request_count,promoted_procurement_request_count,procurement_order_count,undelivered_order_count,delivered_order_count,parts_requested,parts_issued,parts_installed,supply_chain_status')
        .eq('organization_id', org)
        .in('supply_chain_status', ['missing_asset', 'shortage_without_request', 'waiting_procurement', 'waiting_delivery', 'waiting_installation'])
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(40);
      if (supplyChain.error) throw supplyChain.error;
      evidence.cross_domain_supply = {
        scope: 'maintenance_inventory_procurement',
        semantics: 'Read model determinístico de dependencia OT → material → necesidad → solicitud → orden → entrega/instalación. supply_chain_status describe el punto observable de la cadena; no prueba causa raíz ni autoriza una acción.',
        chains_requiring_attention: supplyChain.data || [],
      };
      sources.add('work_order_supply_chain_v1');
      toolsUsed.push({ name: 'read_executive_supply_chain', mode: 'read' });
    } else if (canReadMaintenance && canReadInventory) {
      const materialDependency = await context.supabase
        .from('work_order_supply_chain_v1')
        .select('work_order_id,work_order_number,canonical_asset_id,title,work_order_status,priority,scheduled_date,material_requirement_count,material_shortage_count,material_shortage_quantity,parts_requested,parts_issued,parts_installed')
        .eq('organization_id', org)
        .gt('material_shortage_count', 0)
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(40);
      if (materialDependency.error) throw materialDependency.error;
      evidence.cross_domain_supply = {
        scope: 'maintenance_inventory',
        semantics: 'Dependencia visible entre OT y faltante/material. No hay permiso de Compras en esta consulta: no inferir solicitud, orden, proveedor ni entrega.',
        chains_requiring_attention: materialDependency.data || [],
      };
      sources.add('work_order_supply_chain_v1');
      toolsUsed.push({ name: 'read_executive_maintenance_inventory_dependency', mode: 'read' });
    } else if (canReadMaintenance && canReadProcurement) {
      const procurementDependency = await context.supabase
        .from('work_order_supply_chain_v1')
        .select('work_order_id,work_order_number,canonical_asset_id,title,work_order_status,priority,scheduled_date,supply_need_count,open_supply_need_count,supply_needs_with_request,procurement_request_count,open_procurement_request_count,promoted_procurement_request_count,procurement_order_count,undelivered_order_count,delivered_order_count,supply_chain_status')
        .eq('organization_id', org)
        .in('supply_chain_status', ['waiting_procurement', 'waiting_delivery'])
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(40);
      if (procurementDependency.error) throw procurementDependency.error;
      evidence.cross_domain_supply = {
        scope: 'maintenance_procurement',
        semantics: 'Dependencia visible entre OT y flujo de Compras. No hay permiso de Inventario en esta consulta: no inferir stock, reserva, faltante físico ni disponibilidad de bodega.',
        chains_requiring_attention: procurementDependency.data || [],
      };
      sources.add('work_order_supply_chain_v1');
      toolsUsed.push({ name: 'read_executive_maintenance_procurement_dependency', mode: 'read' });
    }

    if (access.canRead('finance')) {
      const [overview, centers] = await Promise.all([
        context.supabase.from('finance_overview').select('*').eq('organization_id', org).maybeSingle(),
        context.supabase
          .from('canonical_finance_cost_centers')
          .select('cost_center_code,event_count,recognized_clp,committed_clp,first_event_at,last_event_at')
          .eq('organization_id', org)
          .order('committed_clp', { ascending: false })
          .limit(80),
      ]);
      if (overview.error || centers.error) throw overview.error || centers.error;
      evidence.finance = {
        overview: overview.data || null,
        cost_centers: centers.data || [],
      };
      sources.add('finance_overview');
      sources.add('canonical_finance_cost_centers');
      toolsUsed.push({ name: 'read_executive_finance', mode: 'read' });
    }

    const governedMemory = await loadExecutiveGovernedMemory(context, access.domains, 12);
    const regulatoryContext = await loadRegulatoryIntelligenceContext(context, 20);
    const advisoryHandoffs = await loadSupportAdvisoryHandoffs(context, 'executive', message);
    const advisoryContext = supportAdvisoryHandoffPrompt(
      advisoryHandoffs,
      'Una prioridad o recomendación previa no conserva prioridad por sí sola. Reevalúa impacto, frescura, permisos, contradicciones y evidencia faltante antes de mantenerla entre las prioridades ejecutivas. Si el caso ya no está respaldado, dilo y no lo priorices.',
    );

    const instructions = `Eres el Asistente Senior del Centro Ejecutivo de MOTIL para una operación minera chilena. Tu función es convertir evidencia autorizada en una lista corta de decisiones y validaciones humanas de mayor valor.\n\nREGLAS OBLIGATORIAS:\n1. Usa exclusivamente EVIDENCIA MOTIL para afirmaciones operacionales. Nunca insinúes conocimiento de dominios no presentes o no autorizados.\n2. MEMORIA GOBERNADA es contexto laboral estable NO CANÓNICO. Úsala sólo para adaptar lenguaje, foco y presentación. Nunca la uses como hecho operacional, evidencia, permiso, prioridad, causalidad ni autorización. Si contradice evidencia actual, gana la evidencia actual.\n3. CONTEXTO REGULATORIO es una referencia ADVISORY separada. Puede describir estructuras, requisitos y evidencia esperable, pero nunca prueba cumplimiento, incumplimiento, aplicabilidad legal, prioridad, causalidad ni autorización. Si la pregunta es regulatoria, responde OBSERVADO EN MOTIL → REFERENCIA REGULATORIA → BRECHA/INCERTIDUMBRE → VALIDACIÓN HUMANA.\n4. HISTORIAL CONVERSACIONAL es contexto no canónico aportado por el usuario y por respuestas previas. Nunca reemplaza EVIDENCIA MOTIL, nunca eleva una afirmación previa a hecho operacional y nunca autoriza acceso o acciones.\n5. HANDOFF ADVISORY es contexto NO CANÓNICO: sólo define qué revalidar. Una prioridad o recomendación previa nunca mantiene vigencia, severidad, causalidad ni prioridad sin respaldo de la evidencia actual.\n6. Conserva por separado la fecha de corte de cada fuente. No llames "hoy" o "actual" a un dato cuyo corte sea anterior.\n7. No conviertas ausencia de permiso, ausencia de fuente ni vacío de datos en un cero operacional.\n8. No mezcles compromisos de compra, gasto reconocido, pagos, stock, producción o costos como si fueran la misma métrica.\n9. Una alerta, warning, cola o status sólo describe la semántica de su fuente; no es causa raíz ni riesgo probabilístico por sí solo.\n10. Prioriza máximo 3 asuntos cuando la pregunta sea general. Para cada uno: DATO CANÓNICO → POR QUÉ IMPORTA → INCERTIDUMBRE/EVIDENCIA FALTANTE → SIGUIENTE DECISIÓN O VALIDACIÓN HUMANA.\n11. Una prioridad ejecutiva es una recomendación explicable, no una orden ni autorización.\n12. No ejecutes acciones, no apruebes, no cierres, no compres, no ajustes stock y no cambies estados.\n13. Si las fechas de corte entre dominios no son comparables, dilo antes de correlacionarlos.\n14. Para CROSS_DOMAIN_SUPPLY, respeta estrictamente el campo scope. Con scope maintenance_inventory_procurement puedes describir OT → faltante/requerimiento → necesidad → solicitud → orden → entrega/instalación. Con scope maintenance_inventory sólo puedes describir OT → material/faltante y debes declarar que Compras no está visible. Con scope maintenance_procurement sólo puedes describir OT → necesidad/solicitud/orden/entrega y debes declarar que stock/bodega no está visible. Nunca conviertas supply_chain_status en causa raíz. Si falta un eslabón visible, ese es el siguiente punto que requiere validación o acción humana.\n15. Cuando exista CROSS_DOMAIN_SUPPLY y la pregunta sea “qué bloquea”, “por qué”, “qué falta” o equivalente, presenta una cadena causal observada como PROBLEMA → DEPENDENCIA OBSERVADA → ESLABÓN FALTANTE/PENDIENTE → SIGUIENTE VALIDACIÓN HUMANA.\n16. Cuando exista EVIDENCIA EQUIPMENT, úsala para responder por ese activo específico. Separa horómetro/runtime de MTBF/MTTR; work_order_parts no prueba stock disponible; una vista de confiabilidad sin filas significa evidencia no disponible, no cero; recurrencia observada no es predicción de falla; Decision Cases del equipo siguen siendo advisory.\n17. Responde breve, operacional y sin JSON crudo.
18. PLAN DE SKILLS es orientación interna, no evidencia ni autoridad. Una skill AVAILABLE puede orientar qué evidencia cruzar; una DEGRADED sólo puede aparecer como brecha; una DORMANT no debe participar de una prioridad ejecutiva.
19. Ninguna skill amplía dominios autorizados, conserva una prioridad previa ni habilita una acción.`;

    const result = await callModel(
      instructions,
      `DOMINIOS AUTORIZADOS\n${JSON.stringify(access.domains)}\n\n${governedMemory.promptContext}\n\n${regulatoryContext.promptContext}\n\nHISTORIAL CONVERSACIONAL NO CANÓNICO\n${conversationTranscript(history)}\n\n${advisoryContext}\n\nPLAN DE SKILLS NO CANÓNICO\n${JSON.stringify(plannedSkills)}\n\nEVIDENCIA MOTIL CANÓNICA/AUTORIZADA\n${JSON.stringify(evidence)}\n\nPREGUNTA ACTUAL\n${message}`,
    );

    const refs = sourceRefs(sources, toolsUsed);
    const persisted = await appendCoreMessage(context.supabase, scope, {
      conversationId: conversation.id,
      role: 'assistant',
      content: result.text,
      sourceRefs: refs,
      model: result.model,
    });

    const groundedEvaluation = evaluateGroundedCoreResponse({
      answer: result.text,
      evidence,
      sourceRefs: refs as Array<Record<string, unknown>>,
      route,
    });
    let groundedEvaluationPersisted = false;
    if (persisted?.id) {
      const evaluationUpdate = await context.supabase
        .from('motil_ai_core_runs')
        .update({
          evaluation_state: groundedEvaluation.state,
          evaluation_detail: groundedEvaluation,
          evaluator_version: groundedEvaluation.version,
          evaluated_at: new Date().toISOString(),
        })
        .eq('organization_id', org)
        .eq('user_id', context.userId)
        .eq('response_message_id', persisted.id);
      if (evaluationUpdate.error) {
        console.warn('[executive-assistant] grounded evaluation persistence skipped', {
          detail: evaluationUpdate.error.message,
          responseMessageId: persisted.id,
        });
      } else {
        groundedEvaluationPersisted = true;
      }
    }

    let decisionCaseRevalidation = { updated: 0, at: null as string | null };
    if (persisted && advisoryHandoffs.length && refs.length) {
      try {
        decisionCaseRevalidation = await recordSupportAdvisoryRevalidation(
          context,
          'executive',
          advisoryHandoffs,
          refs,
        );
      } catch (error) {
        console.warn('[executive-assistant] advisory revalidation metadata skipped', {
          detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
      }
    }

    return NextResponse.json({
      answer: result.text,
      message: persisted,
      model: result.model,
      responseId: result.responseId,
      sources: Array.from(sources),
      toolsUsed,
      conversationId: conversation.id,
      decisionCaseRefs: advisoryHandoffs.map((row) => row.id),
      decisionCaseRevalidation,
      groundedEvaluation: {
        state: groundedEvaluation.state,
        version: groundedEvaluation.version,
        persisted: groundedEvaluationPersisted,
        failedChecks: groundedEvaluation.checks.filter((check) => !check.pass).map((check) => check.key),
        authority: groundedEvaluation.authority,
      },
      equipmentContext: equipmentContext
        ? {
            available: equipmentContext.available,
            asset: equipmentContext.asset,
            authority: equipmentContext.authority,
            errorCode: equipmentContext.errorCode,
          }
        : {
            available: false,
            asset: null,
            authority: 'canonical_operational_context',
            errorCode: null,
          },
      governedMemory: {
        available: governedMemory.available,
        count: governedMemory.count,
        domains: governedMemory.domains,
        authority: governedMemory.authority,
        errorCode: governedMemory.errorCode,
      },
      regulatoryContext: {
        available: regulatoryContext.available,
        authority: regulatoryContext.authority,
        allowedScopes: regulatoryContext.allowedScopes,
        sourceCount: regulatoryContext.sourceCount,
        evidenceCount: regulatoryContext.canonicalEvidence?.count ?? 0,
        coverage: regulatoryContext.canonicalEvidence?.coverage ?? [],
        complianceVerdictCalculated: regulatoryContext.complianceVerdictCalculated,
        errorCode: regulatoryContext.errorCode,
      },
      route,
      skillPlan: plannedSkills,
      skillSummary: skillRuntime.summary,
      authorizedDomains: access.domains,
      persistence: 'core_continuity_v1',
      policy: 'READ_ONLY + permission-aware: Equipment Intelligence entra sólo como evidencia operacional canónica del activo resuelto inequívocamente; contexto regulatorio, memoria, historial y Decision Cases conservan sus fronteras.',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
    const configurationError = detail.includes('OPENAI_API_KEY');
    const httpStatus = configurationError ? 503 : 500;
    await recordCoreRuntimeError({
      db: context.supabase,
      organizationId: context.organizationId,
      userId: context.userId,
      domain: 'executive',
      route,
      phase: 'executive_request',
      error,
      httpStatus,
    });
    console.error('[executive-assistant] request failed', { detail });
    return NextResponse.json({
      error: configurationError ? 'El servicio de IA no está configurado en este entorno.' : 'No fue posible construir la síntesis ejecutiva.',
    }, { status: httpStatus });
  }
}