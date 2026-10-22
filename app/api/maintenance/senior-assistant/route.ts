export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getSupabaseAdmin } from '@/lib/db/supabase';
import { callMaintenanceOperationalAI } from '@/lib/maintenance/senior-assistant-openai';
import { loadSupportAdvisoryHandoffs, supportAdvisoryHandoffPrompt } from '@/lib/intelligence/advisory-handoff-context';
import { buildSkillPlan } from '@/lib/motil-ai/skills/orchestrator';
import { resolveMotilSkillAvailability } from '@/lib/motil-ai/skills/runtime-availability';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6';
const DEFAULT_MEMORY_MODEL = 'gpt-5.6-luna';
const FALLBACK_MODELS = ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const MAX_MESSAGE_CHARS = 12000;
const HISTORY_LIMIT = 40;
const UI_MESSAGE_LIMIT = 20;
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function extractResponseText(payload: any) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return typeof payload?.output_text === 'string' ? payload.output_text.trim() : '';
}

// Text-only OpenAI path used by durable-memory extraction. Operational answers use the bounded tool loop below.
async function callOpenAI(args: {
  instructions: string;
  input: string;
  model?: string;
  maxOutputTokens?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en el servidor');

  const configuredModel = process.env.OPENAI_MAINTENANCE_MODEL?.trim();
  const models = Array.from(new Set([
    args.model,
    configuredModel,
    DEFAULT_MODEL,
    ...FALLBACK_MODELS,
  ].filter(Boolean))) as string[];
  let lastError = 'No hay un modelo de OpenAI disponible';

  for (const model of models) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: args.instructions,
        input: args.input,
        reasoning: { effort: 'medium' },
        max_output_tokens: args.maxOutputTokens || 3600,
      }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI respondió ${response.status}`;
      lastError = detail;
      const invalidModel = /invalid model|model.*not.*found|does not exist|not permitted|not available/i.test(detail);
      if (invalidModel) {
        console.warn('[maintenance-senior-assistant] model unavailable, retrying', { model, detail });
        continue;
      }
      throw new Error(detail);
    }

    const text = extractResponseText(payload);
    if (!text) throw new Error('OpenAI no devolvió texto utilizable');
    return { text, model: payload?.model || model, responseId: payload?.id || null };
  }

  throw new Error(lastError);
}

const isSynthetic = (value: unknown) => /\buat\b|simulad|prueba|test controlado/i.test(String(value ?? ''));
const hasOperationalSignal = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['0', 'no', 'n/a', 'na', '-'].includes(normalized);
};

function conversationTranscript(rows: any[]) {
  if (!rows.length) return 'Sin conversación previa.';
  return rows
    .map((row) => `${row.role === 'assistant' ? 'ASISTENTE' : 'USUARIO'}: ${row.content}`)
    .join('\n\n');
}

function isExpired(lastMessageAt?: string | null) {
  if (!lastMessageAt) return false;
  const timestamp = new Date(lastMessageAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp >= SESSION_IDLE_MS;
}

async function archiveConversation(db: ReturnType<typeof getSupabaseAdmin>, args: {
  conversationId: string;
  organizationId: string;
  userId: string;
}) {
  return db
    .from('maintenance_ai_conversations')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', args.conversationId)
    .eq('organization_id', args.organizationId)
    .eq('user_id', args.userId);
}

async function resolveCargo(db: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data: profile } = await db.from('profiles').select('cargo_id').eq('id', userId).maybeSingle();
  if (!profile?.cargo_id) return null;
  const { data: cargo } = await db.from('cargos').select('name').eq('id', profile.cargo_id).maybeSingle();
  return cargo?.name || null;
}

async function extractDurableMemory(args: { message: string; existingMemory: string[] }) {
  const instructions = `Extrae memoria durable útil para personalizar futuras conversaciones del Asistente Senior de Mantenimiento de MOTIL. Usa SOLAMENTE afirmaciones explícitas del usuario. Nunca guardes contraseñas, secretos, tokens, datos médicos ni inferencias sensibles. Nunca conviertas una afirmación del usuario sobre una máquina, falla, causa, repuesto, prioridad o intervención en evidencia canónica de mantenimiento. Guarda sólo preferencias de trabajo, responsabilidades declaradas, terminología interna, contexto laboral estable, reglas de decisión declaradas u observaciones de contexto que deban seguir tratándose como aportes del usuario. Devuelve JSON puro, sin markdown, como un arreglo de objetos {"type":"preference|responsibility|terminology|working_context|decision_rule|observation","text":"...","confidence":0.0}. Máximo 3 objetos. Si no hay memoria durable, devuelve [].`;
  const input = `MEMORIA YA CONOCIDA:\n${args.existingMemory.join('\n') || 'Ninguna'}\n\nMENSAJE NUEVO DEL USUARIO:\n${args.message}`;
  try {
    const result = await callOpenAI({
      instructions,
      input,
      model: process.env.OPENAI_MAINTENANCE_MEMORY_MODEL || DEFAULT_MEMORY_MODEL,
      maxOutputTokens: 500,
    });
    const clean = result.text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(['preference', 'responsibility', 'terminology', 'working_context', 'decision_rule', 'observation']);
    return parsed
      .slice(0, 3)
      .filter((item) => allowed.has(String(item?.type)) && typeof item?.text === 'string' && item.text.trim().length >= 4)
      .map((item) => ({
        memory_type: String(item.type),
        memory_text: item.text.trim().slice(0, 1000),
        confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.7))),
      }));
  } catch {
    return [];
  }
}

async function buildCanonicalMaintenanceContext(
  db: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
) {
  const windowStart = new Date(Date.now() - 89 * DAY_MS).toISOString().slice(0, 10);
  const [reviews, operationalReports, preventive, workOrders, reliability, closeReadiness, assets] = await Promise.all([
    db.from('drilling_maintenance_review_queue_v1')
      .select('review_id,canonical_asset_id,asset_code,asset_name,operation_date,review_reason,equipment_status_raw,machine_observations,review_status,has_linked_work_order')
      .eq('organization_id', organizationId).eq('review_status', 'pending').eq('has_linked_work_order', false).limit(50),
    db.from('production_drilling_source_reports')
      .select('canonical_asset_id,operation_date,equipment_status_raw,equipment_without_crew_raw,power_outage_raw,water_shortage_raw')
      .eq('organization_id', organizationId)
      .gte('operation_date', windowStart)
      .not('canonical_asset_id', 'is', null)
      .limit(5000),
    db.from('preventive_maintenance_hour_status_v1')
      .select('schedule_id,canonical_asset_id,asset_code,asset_name,task_name,frequency_hours,effective_current_meter,due_meter,meter_evidence_source,meter_basis_conflict,hour_status,remaining_hours,generated_work_order_id')
      .eq('organization_id', organizationId).limit(100),
    db.from('maintenance_work_orders')
      .select('id,work_order_number,canonical_asset_id,title,description,work_type,status,priority,scheduled_date,completion_date,actual_duration_hours,down_time_hours,root_cause,preventive_actions,external_cost,created_by')
      .eq('organization_id', organizationId).not('created_by', 'is', null).limit(100),
    db.from('maintenance_reliability_base_v1')
      .select('work_order_id,canonical_asset_id,asset_code,asset_name,root_cause,root_cause_key,work_type,actual_duration_hours,down_time_hours,total_cost,closed_at')
      .eq('organization_id', organizationId).limit(100),
    db.from('work_order_close_readiness_v2')
      .select('work_order_id,work_order_number,canonical_asset_id,title,ready_to_close,next_action,open_procurement_orders,pending_parts,unmet_material_requirements,pending_external_services,open_labor_entries,external_cost_conflict,standard_plan_steps_pending')
      .eq('organization_id', organizationId).limit(100),
    db.from('maintenance_canonical_assets_v1')
      .select('id,asset_code,name,asset_type,category,manufacturer,model,cost_center_code,is_active,validation_status')
      .eq('organization_id', organizationId).limit(200),
  ]);

  const queryErrors = [
    ['drilling_maintenance_review_queue_v1', reviews.error],
    ['production_drilling_source_reports', operationalReports.error],
    ['preventive_maintenance_hour_status_v1', preventive.error],
    ['maintenance_work_orders', workOrders.error],
    ['maintenance_reliability_base_v1', reliability.error],
    ['work_order_close_readiness_v2', closeReadiness.error],
    ['maintenance_canonical_assets_v1', assets.error],
  ] as const;
  const failedQuery = queryErrors.find(([, error]) => Boolean(error));
  if (failedQuery) {
    const [source, error] = failedQuery;
    const detail = (error as any)?.message || JSON.stringify(error);
    throw new Error(`${source}: ${detail}`);
  }

  const assetMap = new Map((assets.data || []).map((row: any) => [String(row.id), row]));
  const operationalMap = new Map<string, any>();
  for (const row of operationalReports.data || []) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId) continue;
    const asset = assetMap.get(assetId);
    const current = operationalMap.get(assetId) || {
      canonical_asset_id: assetId,
      asset_code: asset?.asset_code || null,
      asset_name: asset?.name || null,
      window_start: windowStart,
      drilling_reports: 0,
      out_of_service_reports: 0,
      operational_with_observations_reports: 0,
      operational_reports: 0,
      equipment_without_crew_reports: 0,
      power_outage_reports: 0,
      water_shortage_reports: 0,
      evidence_status: 'source_operational_evidence_only',
    };
    current.drilling_reports += 1;
    const status = String(row.equipment_status_raw || '').trim().toUpperCase();
    if (status === 'FUERA DE SERVICIO') current.out_of_service_reports += 1;
    if (status === 'OPERATIVO CON OBSERVACIONES') current.operational_with_observations_reports += 1;
    if (status === 'OPERATIVO') current.operational_reports += 1;
    if (hasOperationalSignal(row.equipment_without_crew_raw)) current.equipment_without_crew_reports += 1;
    if (hasOperationalSignal(row.power_outage_raw)) current.power_outage_reports += 1;
    if (hasOperationalSignal(row.water_shortage_raw)) current.water_shortage_reports += 1;
    operationalMap.set(assetId, current);
  }
  const observedConditions90d = Array.from(operationalMap.values()).sort((a, b) =>
    (b.out_of_service_reports + b.operational_with_observations_reports) -
    (a.out_of_service_reports + a.operational_with_observations_reports)
  );

  const workOrderMap = new Map((workOrders.data || []).map((row: any) => [String(row.id), row]));
  const reliableClosures = (reliability.data || []).filter((row: any) => {
    const source = workOrderMap.get(String(row.work_order_id));
    return source && !isSynthetic(source.root_cause) && !isSynthetic(source.preventive_actions) && !isSynthetic(source.description) && !isSynthetic(source.title);
  });

  const sources = [
    'maintenance_canonical_assets_v1',
    'drilling_maintenance_review_queue_v1',
    'production_drilling_source_reports',
    'preventive_maintenance_hour_status_v1',
    'maintenance_work_orders',
    'maintenance_reliability_base_v1',
    'work_order_close_readiness_v2',
  ];

  return {
    sources,
    context: {
      generated_at: new Date().toISOString(),
      semantics: {
        operational_frequency: 'Frecuencia observada en reportes; NO es probabilidad de falla.',
        review_queue: 'Observaciones de terreno pendientes de validación humana; no son diagnósticos confirmados.',
        preventive_due: 'Vencimiento calculado desde pauta y evidencia de horómetro.',
        reliability: 'Sólo cierres operacionales no UAT/simulados pueden usarse como experiencia histórica confiable.',
        authority: 'El mantenedor/supervisor valida diagnóstico, prioridad e intervención. El asistente no crea ni cierra OT.',
      },
      assets: assets.data || [],
      pending_operational_reviews: reviews.data || [],
      observed_conditions_90d: observedConditions90d,
      preventive_hour_status: preventive.data || [],
      operational_work_orders: workOrders.data || [],
      audited_non_synthetic_reliability: reliableClosures,
      closure_readiness: closeReadiness.data || [],
    },
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const db = getSupabaseAdmin();
  const requestedId = request.nextUrl.searchParams.get('conversationId');
  const before = request.nextUrl.searchParams.get('before');
  let conversation: any = null;

  if (requestedId) {
    const { data, error } = await db
      .from('maintenance_ai_conversations')
      .select('id,title,status,last_message_at,created_at')
      .eq('id', requestedId)
      .eq('organization_id', context.organizationId)
      .eq('user_id', context.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversation = data;
  } else {
    const { data, error } = await db
      .from('maintenance_ai_conversations')
      .select('id,title,status,last_message_at,created_at')
      .eq('organization_id', context.organizationId)
      .eq('user_id', context.userId)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversation = data;
  }

  if (conversation?.id && isExpired(conversation.last_message_at)) {
    await archiveConversation(db, {
      conversationId: conversation.id,
      organizationId: context.organizationId,
      userId: context.userId,
    });
    conversation = null;
  }

  let messages: any[] = [];
  let hasMore = false;
  let oldestMessageAt: string | null = null;
  if (conversation?.id) {
    let query = db
      .from('maintenance_ai_messages')
      .select('id,role,content,source_refs,model,created_at')
      .eq('conversation_id', conversation.id)
      .eq('organization_id', context.organizationId)
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false })
      .limit(UI_MESSAGE_LIMIT + 1);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data || [];
    hasMore = rows.length > UI_MESSAGE_LIMIT;
    messages = rows.slice(0, UI_MESSAGE_LIMIT).reverse();
    oldestMessageAt = messages[0]?.created_at || null;
  }

  const [{ data: memories, error: memoryError }, cargo] = await Promise.all([
    db.from('maintenance_ai_user_memory')
      .select('memory_type,memory_text,confidence,updated_at')
      .eq('organization_id', context.organizationId)
      .eq('user_id', context.userId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(20),
    resolveCargo(db, context.userId),
  ]);
  if (memoryError) return NextResponse.json({ error: memoryError.message }, { status: 500 });

  return NextResponse.json({
    conversation,
    messages,
    hasMore,
    oldestMessageAt,
    sessionIdleHours: SESSION_IDLE_MS / (60 * 60 * 1000),
    memoryCount: memories?.length || 0,
    cargo,
    agent: 'Asistente Senior de Mantenimiento MOTIL',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const requestedConversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;
  const ephemeral = body?.ephemeral === true;
  const db = getSupabaseAdmin();

  if (body?.action === 'archive') {
    if (requestedConversationId) {
      await archiveConversation(db, {
        conversationId: requestedConversationId,
        organizationId: context.organizationId,
        userId: context.userId,
      });
    }
    return NextResponse.json({ archived: Boolean(requestedConversationId) });
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Escribe una consulta de mantenimiento.' }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: 'La consulta es demasiado extensa.' }, { status: 400 });

  let conversation: any = null;
  let userMessage: any = null;

  try {
    if (!ephemeral && requestedConversationId) {
      const { data, error } = await db
        .from('maintenance_ai_conversations')
        .select('id,title,last_message_at')
        .eq('id', requestedConversationId)
        .eq('organization_id', context.organizationId)
        .eq('user_id', context.userId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw new Error(error.message);
      conversation = data;
    }

    if (!ephemeral && conversation?.id && isExpired(conversation.last_message_at)) {
      await archiveConversation(db, {
        conversationId: conversation.id,
        organizationId: context.organizationId,
        userId: context.userId,
      });
      conversation = null;
    }

    if (!ephemeral && !conversation) {
      const { data, error } = await db
        .from('maintenance_ai_conversations')
        .insert({
          organization_id: context.organizationId,
          user_id: context.userId,
          title: message.slice(0, 90),
        })
        .select('id,title,last_message_at')
        .single();
      if (error) throw new Error(error.message);
      conversation = data;
    }

    if (!ephemeral && conversation?.id) {
      const { data, error } = await db
        .from('maintenance_ai_messages')
        .insert({
          conversation_id: conversation.id,
          organization_id: context.organizationId,
          user_id: context.userId,
          role: 'user',
          content: message,
        })
        .select('id,role,content,created_at')
        .single();
      if (error) throw new Error(error.message);
      userMessage = data;
    }

    const historyQuery = conversation?.id && !ephemeral
      ? db.from('maintenance_ai_messages')
          .select('role,content,created_at')
          .eq('conversation_id', conversation.id)
          .eq('organization_id', context.organizationId)
          .eq('user_id', context.userId)
          .neq('id', userMessage?.id || '')
          .order('created_at', { ascending: false })
          .limit(HISTORY_LIMIT)
      : Promise.resolve({ data: [], error: null });

    const [historyResult, memoryResult, cargo, canonical, advisoryHandoffs, skillRuntime, skillPlan] = await Promise.all([
      historyQuery,
      db.from('maintenance_ai_user_memory')
        .select('memory_type,memory_text,confidence')
        .eq('organization_id', context.organizationId)
        .eq('user_id', context.userId)
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(20),
      resolveCargo(db, context.userId),
      buildCanonicalMaintenanceContext(db, context.organizationId),
      loadSupportAdvisoryHandoffs(context, 'maintenance', message),
      resolveMotilSkillAvailability(context, ['maintenance']),
      Promise.resolve(buildSkillPlan(message)),
    ]);

    if ((historyResult as any)?.error) throw new Error((historyResult as any).error.message);
    if (memoryResult.error) throw new Error(memoryResult.error.message);

    const history = [...((historyResult as any)?.data || [])].reverse();
    const memoryRows = memoryResult.data || [];
    const memory = memoryRows.map((row: any) => `${row.memory_type}: ${row.memory_text}`);
    const userIdentity = context.userName || context.userEmail || 'Usuario';
    const accessLevel = access.canWrite ? 'ED' : 'LEC';
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

    const advisoryContext = supportAdvisoryHandoffPrompt(
      advisoryHandoffs,
      'En Mantención, revalida activos, observaciones, OT, preventivos, materiales, cierre y confiabilidad con las herramientas READ/PREPARE_ONLY. Un caso previo no confirma diagnóstico, causa raíz, criticidad, probabilidad de falla ni prioridad de intervención.',
    );

    const instructions = `Eres el Asistente Senior de Mantenimiento de MOTIL para una operación minera chilena. Respondes como copiloto técnico de un jefe de mantenimiento, planificador o supervisor.\n\nCONTEXTO DEL USUARIO:\n- Usuario: ${userIdentity}\n- Cargo: ${cargo || 'no informado'}\n- Nivel de acceso: ${accessLevel}\n- Memoria de trabajo declarada por el usuario: ${memory.length ? memory.join(' | ') : 'sin memoria durable registrada'}\nLa memoria de usuario sirve para personalizar forma de trabajo y continuidad, pero NUNCA reemplaza evidencia canónica sobre activos, fallas, causas, repuestos, prioridades o intervenciones.\n\nREGLAS DE AUTORIDAD Y SEGURIDAD:\n1. Usa únicamente el CONTEXTO CANÓNICO y las herramientas READ/PREPARE_ONLY entregadas para afirmaciones operacionales. Si falta evidencia, dilo explícitamente.\n2. Distingue siempre DATO CANÓNICO, INTERPRETACIÓN PROFESIONAL, HIPÓTESIS A REVISAR y RECOMENDACIÓN/PRÓXIMA ACCIÓN cuando corresponda.\n3. Un porcentaje de reportes fuera de servicio u observados describe frecuencia histórica observada; jamás lo llames probabilidad de falla.\n4. Separa causas mecánicas de restricciones externas como falta de agua, corte de energía o falta de dotación.\n5. No uses UAT, simulaciones o pruebas como evidencia de confiabilidad real.\n6. No declares causa raíz si no está validada. No declares MTBF/MTTR predictivo si no existe evidencia suficiente.\n7. No inventes repuestos, costos, horas, manuales, tolerancias ni procedimientos OEM.\n8. No crees, cierres, priorices de forma irreversible ni autorices una OT. Puedes recomendar qué revisar y por qué; la decisión final es humana.\n9. Si existe evidencia contradictoria, muéstrala. Si una máquina tuvo reportes degradados y también muchos reportes operativos normales, incluye ambos.\n10. Prioriza respuestas operacionales y concretas: qué sabemos, qué nos preocupa, qué falta confirmar y cuál es el siguiente dato/acción de mayor valor.\n11. La conversación reciente aporta continuidad, pero una afirmación previa del usuario no se transforma por repetición en dato canónico.\n12. Cuando una pregunta requiera activos, señales, preventivos, OT o preparación de cierre específicos, usa las herramientas READ en vez de inferir desde memoria o conversación.\n13. PREPARE_ONLY puede estructurar un borrador de Decision Case para revisión humana, pero no lo persiste como verdad operacional, no lo aprueba, no autoriza y no ejecuta ninguna acción.\n14. No muestres al usuario call_id, argumentos JSON crudos, resultados JSON crudos ni detalles internos de herramientas. Resume la evidencia operacional relevante.\n15. Un score de atención sólo ordena revisión humana de forma determinística; no es probabilidad de falla, criticidad OEM, diagnóstico ni autorización de prioridad.\n16. HANDOFF ADVISORY es contexto NO CANÓNICO y sólo define qué revalidar. Nunca conserva diagnóstico, causa, prioridad, severidad ni vigencia sin respaldo del contexto canónico y de las herramientas actuales.\n17. PLAN DE SKILLS es orientación interna, no evidencia. Una skill AVAILABLE puede orientar qué fuentes combinar, pero la conclusión debe provenir del contexto canónico y herramientas actuales.\n18. Una skill DEGRADED sólo sirve para explicar qué falta; no debe presentarse como capacidad completa.\n19. Una skill DORMANT no debe usarse ni insinuarse como disponible. Si la consulta depende de ella, declara qué dato sincronizado falta.\n20. Ninguna skill amplía permisos ni convierte una recomendación en acción autorizada.\n\nCuando el usuario pregunte qué equipo requiere atención, usa la cola de atención y luego profundiza con herramientas del activo cuando sea necesario. Compara señales observadas, estado fuera de servicio, preventivos, OT abiertas y evidencia de cierre. No conviertas un ranking operacional en riesgo probabilístico.`;

    const canonicalAvailability = {
      generated_at: canonical.context.generated_at,
      semantics: canonical.context.semantics,
      available_sources: canonical.sources,
      available_evidence_counts: {
        assets: canonical.context.assets.length,
        pending_operational_reviews: canonical.context.pending_operational_reviews.length,
        observed_conditions_90d: canonical.context.observed_conditions_90d.length,
        preventive_hour_status: canonical.context.preventive_hour_status.length,
        operational_work_orders: canonical.context.operational_work_orders.length,
        audited_non_synthetic_reliability: canonical.context.audited_non_synthetic_reliability.length,
        closure_readiness: canonical.context.closure_readiness.length,
      },
    };

    const modelInput = `CONVERSACIÓN RECIENTE\n${conversationTranscript(history)}\n\n${advisoryContext}\n\nPLAN DE SKILLS NO CANÓNICO\n${JSON.stringify(plannedSkills)}\n\nCONTEXTO CANÓNICO MOTIL\n${JSON.stringify(canonicalAvailability)}\n\nPREGUNTA ACTUAL\n${message}`;
    const result = await callMaintenanceOperationalAI({
      instructions,
      input: modelInput,
      context: canonical.context,
    });
    const toolsUsed = result.toolAudit.map(({ name, mode }) => ({ name, mode }));
    const sourceRefs = [
      ...canonical.sources.map((source) => ({ source })),
      ...toolsUsed.map((tool) => ({ tool: tool.name, mode: tool.mode })),
    ];

    let assistantMessage: any = null;
    let learned = 0;
    if (!ephemeral && conversation?.id) {
      const { data, error } = await db
        .from('maintenance_ai_messages')
        .insert({
          conversation_id: conversation.id,
          organization_id: context.organizationId,
          user_id: context.userId,
          role: 'assistant',
          content: result.text,
          source_refs: sourceRefs,
          model: result.model,
        })
        .select('id,role,content,source_refs,model,created_at')
        .single();
      if (error) throw new Error(error.message);
      assistantMessage = data;

      await db.from('maintenance_ai_conversations')
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
        .eq('organization_id', context.organizationId)
        .eq('user_id', context.userId);

      const extracted = await extractDurableMemory({ message, existingMemory: memory });
      if (extracted.length) {
        const known = new Set(memoryRows.map((row: any) => `${String(row.memory_type).toLowerCase()}::${String(row.memory_text).trim().toLowerCase()}`));
        const additions = extracted.filter((item) => !known.has(`${item.memory_type.toLowerCase()}::${item.memory_text.trim().toLowerCase()}`));
        if (additions.length) {
          const { error: memoryInsertError } = await db.from('maintenance_ai_user_memory').insert(additions.map((item) => ({
            organization_id: context.organizationId,
            user_id: context.userId,
            source_message_id: userMessage?.id || null,
            ...item,
          })));
          if (memoryInsertError) {
            console.warn('[maintenance-senior-assistant] memory insert skipped', { detail: memoryInsertError.message });
          } else {
            learned = additions.length;
          }
        }
      }
    }

    return NextResponse.json({
      answer: result.text,
      model: result.model,
      responseId: result.responseId,
      sources: canonical.sources,
      toolsUsed,
      conversationId: conversation?.id || null,
      message: assistantMessage,
      learned,
      decisionCaseRefs: advisoryHandoffs.map((row) => row.id),
      skillPlan: plannedSkills,
      skillSummary: skillRuntime.summary,
      policy: 'Copiloto explicable con herramientas READ/PREPARE_ONLY: evidencia canónica → interpretación → hipótesis → acción humana. Memoria laboral separada de la verdad operacional; Decision Cases también permanecen como contexto no canónico.',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
    const configurationError = detail.includes('OPENAI_API_KEY');
    console.error('[maintenance-senior-assistant] request failed', {
      code: configurationError ? 'AI_CONFIGURATION_REQUIRED' : 'AI_REQUEST_FAILED',
      detail,
    });
    return NextResponse.json({
      error: configurationError
        ? 'El servicio de IA no está configurado en este entorno.'
        : 'No se pudo consultar el Asistente Senior de Mantenimiento.',
      code: configurationError ? 'AI_CONFIGURATION_REQUIRED' : 'AI_REQUEST_FAILED',
    }, { status: 503 });
  }
}