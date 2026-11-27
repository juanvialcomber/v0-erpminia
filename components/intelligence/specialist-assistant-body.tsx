'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { Database, FileDown, GitBranch, RotateCcw, Send, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { isDanielMasterEvidenceHref } from '@/lib/finance/daniel-master';
import { Button } from '@/components/ui/button';

type SourceRef = {
  source?: string;
  href?: string;
  label?: string;
  tool?: string;
  mode?: 'read' | 'prepare_only' | string;
};

type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  source_refs?: SourceRef[];
  model?: string | null;
  created_at?: string;
};

type ChatState = {
  conversation?: { id: string; title?: string | null } | null;
  messages?: ChatMessage[];
  hasMore?: boolean;
  oldestMessageAt?: string | null;
  sessionIdleHours?: number;
  memoryCount?: number;
  cargo?: string | null;
  persistence?: 'stateless_read_only' | string;
  assistantRequests?: Array<{id:string;title:string;status:string;created_at:string}>;
};

type SpecialistAssistantBodyProps = {
  endpoint: string;
  starters: string[];
  emptyCopy: string;
  loadingCopy: string;
  placeholder: string;
  toolCopy?: Record<string, string>;
  onOpenEvidence: () => void;
};

type HandoffState = { state: 'sending' | 'done' | 'error'; label: string };

const DIRECT_EXECUTIVE_HANDOFF_ENDPOINTS = new Set([
  '/api/inventory/assistant',
  '/api/procurement/assistant',
  '/api/production/assistant',
  '/api/finance/assistant',
  '/api/documents/assistant',
  '/api/data-quality/assistant',
]);

function uniqueEvidenceRefs(refs: SourceRef[]) {
  const unique = new Map<string, SourceRef>();
  for (const ref of refs) {
    const key = ref.href || (ref.tool ? `tool:${ref.tool}:${ref.mode || 'read'}` : ref.source ? `source:${ref.source}` : '');
    if (key && !unique.has(key)) unique.set(key, ref);
  }
  return Array.from(unique.values());
}

export function SpecialistAssistantBody({
  endpoint,
  starters,
  emptyCopy,
  loadingCopy,
  placeholder,
  toolCopy = {},
  onOpenEvidence,
}: SpecialistAssistantBodyProps) {
  const mineAssistant = endpoint === '/api/intelligence/mine-role-assistant';
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [oldestMessageAt, setOldestMessageAt] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [cargo, setCargo] = useState<string | null>(null);
  const [stateless, setStateless] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mineRequests, setMineRequests] = useState<Array<{id:string;title:string;status:string;created_at:string}>>([]);
  const [handoffByMessage, setHandoffByMessage] = useState<Record<string, HandoffState>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const suppressAutoScrollRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError(null);
    fetch(endpoint, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as ChatState & { error?: string };
        if (!response.ok) throw new Error(data?.error || 'No fue posible abrir el asistente.');
        if (!active) return;
        setConversationId(data.conversation?.id || null);
        setMessages(data.messages || []);
        setHasMore(Boolean(data.hasMore));
        setOldestMessageAt(data.oldestMessageAt || null);
        setMemoryCount(data.memoryCount || 0);
        setCargo(data.cargo || null);
        setStateless(data.persistence === 'stateless_read_only');
        setHandoffByMessage({});
        setMineRequests(Array.isArray(data.assistantRequests) ? data.assistantRequests : []);
        setLoaded(true);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'No fue posible abrir el asistente.');
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  useEffect(() => {
    if (suppressAutoScrollRef.current) {
      suppressAutoScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const loadOlder = async () => {
    if (!conversationId || !hasMore || !oldestMessageAt || loadingOlder) return;
    setLoadingOlder(true);
    setError(null);
    try {
      const params = new URLSearchParams({ conversationId, before: oldestMessageAt });
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => null)) as ChatState & { error?: string };
      if (!response.ok) throw new Error(data?.error || 'No fue posible cargar mensajes anteriores.');
      const older = data.messages || [];
      suppressAutoScrollRef.current = true;
      setMessages((current) => {
        const existing = new Set(current.map((item) => item.id).filter(Boolean));
        return [...older.filter((item) => !item.id || !existing.has(item.id)), ...current];
      });
      setHasMore(Boolean(data.hasMore));
      setOldestMessageAt(data.oldestMessageAt || oldestMessageAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar mensajes anteriores.');
    } finally {
      setLoadingOlder(false);
    }
  };

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = message.trim();
    if (!question || sending) return;

    setMessages((current) => [...current, { role: 'user', content: question, created_at: new Date().toISOString() }]);
    setMessage('');
    setSending(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: question, conversationId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible consultar al asistente.');
      setConversationId(payload?.conversationId || conversationId);
      if (payload?.message) {
        setMessages((current) => [...current, payload.message]);
      } else if (payload?.answer) {
        const sourceRefs: SourceRef[] = [
          ...(Array.isArray(payload?.sources) ? payload.sources.map((source: string) => ({ source })) : []),
          ...(Array.isArray(payload?.toolsUsed)
            ? payload.toolsUsed.map((tool: { name?: string; mode?: string }) => ({ tool: tool?.name, mode: tool?.mode }))
            : []),
        ];
        setMessages((current) => [...current, { role: 'assistant', content: payload.answer, source_refs: sourceRefs, model: payload?.model || null }]);
      }
      if (Number(payload?.learned || 0) > 0) setMemoryCount((current) => current + Number(payload.learned));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible consultar al asistente.');
    } finally {
      setSending(false);
    }
  }

  const downloadMineReport = (content: string) => {
    const file = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const element = document.createElement('a');
    element.href = url;
    element.download = `MOTIL_informe_mina_${new Date().toISOString().slice(0,10)}.md`;
    document.body.appendChild(element);
    element.click();
    element.remove();
    URL.revokeObjectURL(url);
  };

  const generateMineReport = async (days: 7 | 30) => {
    if (!mineAssistant || sending) return;
    setSending(true);
    setError(null);
    const question = `Generar informe operacional de los últimos ${days} días`;
    setMessages((current) => [...current, { role: 'user', content: question }]);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'report', periodDays: days, conversationId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo generar el informe.');
      setConversationId(payload?.conversationId || conversationId);
      if (payload?.message) {
        setMessages((current) => [...current, payload.message]);
      } else if (typeof payload?.answer === 'string') {
        setMessages((current) => [...current, { role: 'assistant', content: payload.answer }]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el informe.');
    } finally {
      setSending(false);
    }
  };

  const registerMineRequest = async (item: ChatMessage) => {
    if (!mineAssistant || !item.id || !conversationId) return;
    const currentState = handoffByMessage[item.id];
    if (currentState?.state === 'sending' || currentState?.state === 'done') return;
    setHandoffByMessage((current) => ({ ...current, [item.id!]: { state: 'sending', label: 'Registrando…' } }));
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_request', sourceMessageId: item.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible registrar la solicitud.');
      if (payload?.request?.id) {
        setMineRequests((current) => current.some((row) => row.id === payload.request.id)
          ? current : [payload.request, ...current].slice(0, 8));
      }
      setHandoffByMessage((current) => ({
        ...current, [item.id!]: { state: 'done', label: 'Solicitud registrada · pendiente de revisión' },
      }));
    } catch (cause) {
      setHandoffByMessage((current) => ({
        ...current, [item.id!]: { state: 'error', label: cause instanceof Error ? cause.message : 'No se pudo registrar la solicitud.' },
      }));
    }
  };

  const createExecutiveHandoff = async (item: ChatMessage) => {
    if (!conversationId || !item.id || !DIRECT_EXECUTIVE_HANDOFF_ENDPOINTS.has(endpoint)) return;
    const currentState = handoffByMessage[item.id];
    if (currentState?.state === 'sending' || currentState?.state === 'done') return;
    setHandoffByMessage((current) => ({ ...current, [item.id!]: { state: 'sending', label: 'Derivando…' } }));
    try {
      const response = await fetch('/api/intelligence/decision-cases', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          sourceConversationId: conversationId,
          sourceMessageId: item.id,
          targetDomain: 'executive',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo crear el handoff.');
      setHandoffByMessage((current) => ({
        ...current,
        [item.id!]: {
          state: 'done',
          label: payload?.duplicate ? 'Caso ejecutivo ya abierto' : 'Derivado a Centro Ejecutivo',
        },
      }));
    } catch (cause) {
      setHandoffByMessage((current) => ({
        ...current,
        [item.id!]: {
          state: 'error',
          label: cause instanceof Error ? cause.message : 'No se pudo crear el handoff.',
        },
      }));
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const startNewConversation = async () => {
    if (sending) return;
    setError(null);
    try {
      if (conversationId) {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'archive', conversationId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'No fue posible cerrar la conversación.');
      }
      setConversationId(null);
      setMessages([]);
      setHasMore(false);
      setOldestMessageAt(null);
      setMessage('');
      setHandoffByMessage({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cerrar la conversación.');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-2.5 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"><Database className="size-3" />Canónico</span>
          {cargo ? <span className="max-w-48 truncate rounded-full border border-border px-2 py-1" title={cargo}>{cargo}</span> : null}
          {stateless ? <span className="rounded-full border border-border px-2 py-1">Consulta sin historial</span> : <span className="rounded-full border border-border px-2 py-1">Memoria {memoryCount}</span>}
        </div>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => void startNewConversation()} disabled={sending} aria-label="Nueva conversación" title="Archivar conversación y comenzar una nueva">
          <RotateCcw className="size-4" />
        </Button>
      </div>

      {mineAssistant && mineRequests.length > 0 ? (
        <details className="border-b border-border bg-background px-4 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Mis solicitudes · {mineRequests.length} recientes</summary>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
            {mineRequests.map((req) => (
              <p key={req.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                <span className="truncate">{req.title}</span>
                <span className="shrink-0 text-muted-foreground">{req.status === 'requested' ? 'Por revisar' : req.status}</span>
              </p>
            ))}
          </div>
        </details>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 px-4 py-4" aria-live="polite">
        {!loaded ? <p className="text-sm text-muted-foreground">{loadingCopy}</p> : null}
        {loaded && hasMore ? (
          <div className="mb-4 flex justify-center">
            <Button type="button" variant="ghost" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? 'Cargando…' : 'Ver mensajes anteriores'}
            </Button>
          </div>
        ) : null}

        {loaded && messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{emptyCopy}</p>
            <div className="grid gap-2">
              {starters.map((starter) => (
                <button key={starter} type="button" onClick={() => setMessage(starter)} className="min-h-10 rounded-md border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {messages.map((item, index) => {
            const evidenceRefs = uniqueEvidenceRefs(item.source_refs || []);
            const handoff = item.id ? handoffByMessage[item.id] : null;
            const canCreateExecutiveHandoff = item.role === 'assistant'
              && Boolean(item.id)
              && evidenceRefs.length > 0
              && DIRECT_EXECUTIVE_HANDOFF_ENDPOINTS.has(endpoint);
            return (
              <article key={item.id || `${item.role}-${index}`} className={item.role === 'user' ? 'ml-8 rounded-lg bg-primary px-3 py-2.5 text-sm text-primary-foreground' : 'mr-4 rounded-lg border border-border bg-card px-3 py-3 text-sm text-foreground'}>
                <p className="whitespace-pre-wrap leading-relaxed">{item.content}</p>
                {item.role === 'assistant' && evidenceRefs.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
                    {evidenceRefs.slice(0, 8).map((ref) => {
                      const label = ref.label || (ref.tool ? (toolCopy[ref.tool] || ref.tool) : ref.source);
                      if (ref.href && isDanielMasterEvidenceHref(ref.href)) {
                        return <Link key={ref.href} href={ref.href} onNavigate={onOpenEvidence} className="rounded-full border border-border px-2 py-1 text-primary underline-offset-2 hover:underline">{label}</Link>;
                      }
                      return <span key={`${ref.tool || ref.source}:${ref.mode || 'read'}`} className="rounded-full border border-border px-2 py-1">{label}{ref.mode === 'prepare_only' ? ' · preparar' : ''}</span>;
                    })}
                  </div>
                ) : null}
                {mineAssistant && item.role === 'assistant' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    {item.content.startsWith('# Informe operacional') ? (
                      <Button size="sm" variant="outline" type="button" onClick={() => downloadMineReport(item.content)}>
                        <FileDown className="mr-1 size-3.5" /> Descargar informe
                      </Button>
                    ) : null}
                    {item.id && evidenceRefs.length > 0 && !item.content.startsWith('# Informe operacional') ? (
                      <Button size="sm" variant="ghost" type="button"
                        disabled={handoff?.state === 'sending' || handoff?.state === 'done'}
                        onClick={() => void registerMineRequest(item)}
                        title="Registra una solicitud pendiente de revisión; no ejecuta OT ni compras">
                        <ClipboardList className="mr-1 size-3.5" />
                        {handoff?.state === 'sending' ? 'Registrando…' : handoff?.state === 'done' ? handoff.label : 'Registrar solicitud'}
                      </Button>
                    ) : null}
                    {handoff?.state === 'error' ? <p className="text-xs text-destructive">{handoff.label}</p> : null}
                  </div>
                ) : null}
                {canCreateExecutiveHandoff ? (
                  <div className="mt-2 border-t border-border pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-[11px]"
                      disabled={handoff?.state === 'sending' || handoff?.state === 'done'}
                      onClick={() => void createExecutiveHandoff(item)}
                      title="Crea un Decision Case advisory; no ejecuta ninguna acción operacional"
                    >
                      <GitBranch className="mr-1.5 size-3.5" />
                      {handoff?.state === 'sending' ? 'Derivando…' : handoff?.state === 'done' ? handoff.label : 'Derivar a Centro Ejecutivo'}
                    </Button>
                    {handoff?.state === 'error' ? <p className="mt-1 text-[10px] leading-4 text-destructive">{handoff.label}</p> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {sending ? <div className="mr-4 rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted-foreground">Analizando evidencia canónica…</div> : null}
          <div ref={bottomRef} />
        </div>

        {error ? <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}
      </div>

      {mineAssistant ? <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">Informes:</span>
        <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => void generateMineReport(7)}>7 días</Button>
        <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => void generateMineReport(30)}>30 días</Button>
      </div> : null}
      <form onSubmit={submit} className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-primary/40">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={placeholder}
            className="min-h-12 max-h-28 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label={placeholder}
          />
          <Button type="submit" size="icon" disabled={!message.trim() || sending} aria-label="Enviar pregunta">
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-2 px-1 text-[10px] leading-4 text-muted-foreground">Las recomendaciones se separan de la evidencia. Las acciones operacionales requieren confirmación humana.</p>
      </form>
    </div>
  );
}
