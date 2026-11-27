type CoreConversationDomain =
  | 'executive'
  | 'inventory'
  | 'procurement'
  | 'production'
  | 'finance'
  | 'documents'
  | 'data_health'
  | 'mine_role';

type DbClient = any;

const HISTORY_LIMIT = 40;
const UI_MESSAGE_LIMIT = 20;
const MEMORY_LIMIT = 20;
const DEFAULT_MEMORY_MODEL = 'gpt-5.6-luna';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const ALLOWED_MEMORY_TYPES = new Set([
  'preference',
  'responsibility',
  'terminology',
  'working_context',
]);

export type CoreConversationScope = {
  organizationId: string;
  userId: string;
  domain: CoreConversationDomain;
};

export type CoreSourceRef = {
  source?: string;
  href?: string;
  label?: string;
  tool?: string;
  mode?: 'read' | 'prepare_only' | string;
};

type CoreMemory = {
  memory_type: 'preference' | 'responsibility' | 'terminology' | 'working_context';
  memory_text: string;
  confidence: number;
};

function scopeQuery(query: any, scope: CoreConversationScope) {
  return query
    .eq('organization_id', scope.organizationId)
    .eq('user_id', scope.userId)
    .eq('domain', scope.domain);
}

function titleFromMessage(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Conversación MOTIL';
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}

function extractResponseText(payload: any) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return typeof payload?.output_text === 'string' ? payload.output_text.trim() : '';
}

async function extractControlledMemory(message: string, existingMemory: string[]): Promise<CoreMemory[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MOTIL_MEMORY_MODEL?.trim() || DEFAULT_MEMORY_MODEL,
      instructions: `Extrae memoria durable para MOTIL Intelligence Core usando SOLAMENTE afirmaciones explícitas del usuario. Esta memoria es contexto de trabajo NO CANÓNICO. Guarda únicamente: preference (preferencias de trabajo o formato), responsibility (responsabilidades o rol laboral estable declarados), terminology (terminología interna o nombres que el usuario declara usar) y working_context (contexto laboral estable y no operacional). PROHIBIDO guardar hechos operacionales o estados actuales/pasados de mina, producción, geología, mantenimiento, inventario, compras, finanzas, seguridad, activos, fallas, causas, stocks, precios, cantidades, prioridades, decisiones, recomendaciones, eventos, fechas de operación, métricas, diagnósticos o cualquier conclusión derivada. PROHIBIDO guardar secretos, credenciales, tokens, datos médicos o atributos sensibles. No infieras. No conviertas conversación previa en evidencia. Devuelve JSON puro como arreglo de objetos {"type":"preference|responsibility|terminology|working_context","text":"...","confidence":0.0}. Máximo 3 objetos. Si hay duda o no corresponde, devuelve [].`,
      input: `MEMORIA EXISTENTE NO CANÓNICA:\n${existingMemory.join('\n') || 'Ninguna'}\n\nMENSAJE NUEVO DEL USUARIO:\n${message}`,
      reasoning: { effort: 'low' },
      max_output_tokens: 450,
    }),
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  const text = extractResponseText(payload).replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 3)
      .filter((item) => ALLOWED_MEMORY_TYPES.has(String(item?.type)) && typeof item?.text === 'string' && item.text.trim().length >= 4)
      .map((item) => ({
        memory_type: String(item.type) as CoreMemory['memory_type'],
        memory_text: item.text.trim().slice(0, 1000),
        confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.7))),
      }));
  } catch {
    return [];
  }
}

async function loadCoreMemory(db: DbClient, scope: CoreConversationScope) {
  let query = db
    .from('motil_ai_user_memory')
    .select('memory_type,memory_text,confidence,updated_at');
  query = scopeQuery(query, scope)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(MEMORY_LIMIT);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function learnCoreMemory(
  db: DbClient,
  scope: CoreConversationScope,
  sourceMessageId: string,
  message: string,
) {
  try {
    const existingRows = await loadCoreMemory(db, scope);
    const existing = existingRows.map((row: any) => `${row.memory_type}: ${row.memory_text}`);
    const extracted = await extractControlledMemory(message, existing);
    if (!extracted.length) return 0;

    const known = new Set(
      existingRows.map((row: any) => `${String(row.memory_type).toLowerCase()}::${String(row.memory_text).trim().toLowerCase()}`),
    );
    const additions = extracted.filter(
      (item) => !known.has(`${item.memory_type.toLowerCase()}::${item.memory_text.trim().toLowerCase()}`),
    );
    if (!additions.length) return 0;

    const { error } = await db.from('motil_ai_user_memory').insert(additions.map((item) => ({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      domain: scope.domain,
      source_message_id: sourceMessageId,
      ...item,
    })));
    if (error) {
      console.warn('[motil-intelligence-core] memory insert skipped', { detail: error.message, domain: scope.domain });
      return 0;
    }
    return additions.length;
  } catch (error) {
    console.warn('[motil-intelligence-core] memory extraction skipped', {
      detail: error instanceof Error ? error.message : String(error ?? 'unknown'),
      domain: scope.domain,
    });
    return 0;
  }
}

export function conversationTranscript(rows: any[]) {
  if (!rows.length) return 'Sin conversación previa.';
  return rows
    .map((row) => {
      if (row.role === 'memory') return `MEMORIA CONTROLADA NO CANÓNICA: ${row.content}`;
      return `${row.role === 'assistant' ? 'ASISTENTE' : 'USUARIO'}: ${row.content}`;
    })
    .join('\n\n');
}

export async function getCoreConversationState(
  db: DbClient,
  scope: CoreConversationScope,
  args: { conversationId?: string | null; before?: string | null } = {},
) {
  let conversation: any = null;

  if (args.conversationId) {
    let query = db
      .from('motil_ai_conversations')
      .select('id,title,status,last_message_at,created_at');
    query = scopeQuery(query, scope)
      .eq('id', args.conversationId)
      .eq('status', 'active')
      .maybeSingle();
    const { data, error } = await query;
    if (error) throw error;
    conversation = data;
  } else {
    let query = db
      .from('motil_ai_conversations')
      .select('id,title,status,last_message_at,created_at');
    query = scopeQuery(query, scope)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await query;
    if (error) throw error;
    conversation = data;
  }

  const memories = await loadCoreMemory(db, scope);

  if (!conversation) {
    return {
      conversation: null,
      messages: [],
      hasMore: false,
      oldestMessageAt: null,
      memoryCount: memories.length,
    };
  }

  let messagesQuery = db
    .from('motil_ai_messages')
    .select('id,role,content,source_refs,model,created_at');
  messagesQuery = scopeQuery(messagesQuery, scope)
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(UI_MESSAGE_LIMIT + 1);
  if (args.before) messagesQuery = messagesQuery.lt('created_at', args.before);

  const { data: rows, error: messagesError } = await messagesQuery;
  if (messagesError) throw messagesError;
  const page = rows || [];
  const hasMore = page.length > UI_MESSAGE_LIMIT;
  const messages = page.slice(0, UI_MESSAGE_LIMIT).reverse();

  return {
    conversation,
    messages,
    hasMore,
    oldestMessageAt: messages[0]?.created_at || null,
    memoryCount: memories.length,
  };
}

export async function archiveCoreConversation(
  db: DbClient,
  scope: CoreConversationScope,
  conversationId: string,
) {
  let query = db
    .from('motil_ai_conversations')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  query = scopeQuery(query, scope).eq('id', conversationId).eq('status', 'active');
  const { error } = await query;
  if (error) throw error;
}

export async function resolveCoreConversation(
  db: DbClient,
  scope: CoreConversationScope,
  args: { conversationId?: string | null; firstMessage: string },
) {
  if (args.conversationId) {
    let query = db.from('motil_ai_conversations').select('id,title,status,last_message_at');
    query = scopeQuery(query, scope)
      .eq('id', args.conversationId)
      .eq('status', 'active')
      .maybeSingle();
    const { data, error } = await query;
    if (error) throw error;
    if (data) return data;
  }

  let existingQuery = db.from('motil_ai_conversations').select('id,title,status,last_message_at');
  existingQuery = scopeQuery(existingQuery, scope)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error: createError } = await db
    .from('motil_ai_conversations')
    .insert({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      domain: scope.domain,
      title: titleFromMessage(args.firstMessage),
      status: 'active',
    })
    .select('id,title,status,last_message_at')
    .single();
  if (createError) throw createError;
  return created;
}

export async function getCoreConversationHistory(
  db: DbClient,
  scope: CoreConversationScope,
  conversationId: string,
) {
  let query = db
    .from('motil_ai_messages')
    .select('id,role,content,source_refs,model,created_at');
  query = scopeQuery(query, scope)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  const [{ data, error }, memories] = await Promise.all([
    query,
    loadCoreMemory(db, scope),
  ]);
  if (error) throw error;
  const memoryRows = memories.map((row: any) => ({
    role: 'memory',
    content: `${row.memory_type}: ${row.memory_text}`,
  }));
  return [...memoryRows, ...(data || []).reverse()];
}

export async function appendCoreMessage(
  db: DbClient,
  scope: CoreConversationScope,
  args: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    sourceRefs?: CoreSourceRef[];
    model?: string | null;
  },
) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('motil_ai_messages')
    .insert({
      conversation_id: args.conversationId,
      organization_id: scope.organizationId,
      user_id: scope.userId,
      domain: scope.domain,
      role: args.role,
      content: args.content,
      source_refs: args.sourceRefs || [],
      model: args.model || null,
    })
    .select('id,role,content,source_refs,model,created_at')
    .single();
  if (error) throw error;

  let update = db
    .from('motil_ai_conversations')
    .update({ last_message_at: now, updated_at: now });
  update = scopeQuery(update, scope).eq('id', args.conversationId).eq('status', 'active');
  const { error: updateError } = await update;
  if (updateError) throw updateError;

  if (args.role === 'user') {
    await learnCoreMemory(db, scope, data.id, args.content);
  }

  return data;
}