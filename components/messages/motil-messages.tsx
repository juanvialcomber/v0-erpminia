'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Bell, Check, ChevronLeft, Loader2, MessageCircle, Plus, RefreshCw, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/dictionaries';

type Person = { id: string; name: string };
type Conversation = {
  id: string; kind: 'general' | 'direct'; name: string; contactId: string | null;
  unread: number; lastMessage: string | null; lastMessageAt: string | null;
};
type Inbox = { me: Person; conversations: Conversation[]; people: Person[] };
type Message = { id: string; senderId: string; senderName: string; text: string; createdAt: string };
type History = { messages: Message[]; hasMore: boolean; peerLastReadAt?: string | null };

const copy = {
  es: {
    title: 'Mensajes', subtitle: 'Conversaciones de tu organización',
    newChat: 'Mensaje directo', selectUser: 'Seleccionar persona', open: 'Abrir',
    general: 'Organización', direct: 'Directos', noChats: 'Aún no hay conversaciones.',
    noMessages: 'No hay mensajes todavía. Escribe el primero.',
    placeholder: 'Escribe un mensaje…', send: 'Enviar', older: 'Ver mensajes anteriores',
    unavailable: 'No se pudo cargar la mensajería.', retry: 'Reintentar',
    sending: 'Enviando…', sendFailure: 'No se pudo enviar. Puedes reintentar sin duplicar el mensaje.',
    enablePush: 'Activar avisos', pushReady: 'Avisos activados en este dispositivo.',
    pushDenied: 'Permite las notificaciones en la configuración del navegador.',
    pushUnsupported: 'Este dispositivo no admite Web Push. En iPhone, instala MOTIL en Inicio.',
    pushUnavailable: 'No se pudo registrar este dispositivo.',
    privacy: 'Los mensajes quedan registrados en MOTIL. Los avisos del teléfono no contienen el texto privado.',
    refresh: 'Se actualiza automáticamente', choose: 'Elige una conversación',
    read: 'Leído', recorded: 'Registrado', loading: 'Cargando conversaciones…',
    back: 'Conversaciones', newLabel: 'Nuevo mensaje', chars: 'Máximo 2000 caracteres',
  },
  en: {
    title: 'Messages', subtitle: 'Your organization conversations',
    newChat: 'Direct message', selectUser: 'Select a colleague', open: 'Open',
    general: 'Organization', direct: 'Direct', noChats: 'No conversations yet.',
    noMessages: 'No messages yet. Write the first one.',
    placeholder: 'Write a message…', send: 'Send', older: 'Load older messages',
    unavailable: 'Messages could not be loaded.', retry: 'Retry',
    sending: 'Sending…', sendFailure: 'Could not send. Retry without duplicating the message.',
    enablePush: 'Enable alerts', pushReady: 'Alerts enabled on this device.',
    pushDenied: 'Allow notifications in your browser settings.',
    pushUnsupported: 'This device does not support Web Push. On iPhone, add MOTIL to Home Screen.',
    pushUnavailable: 'Could not register this device.',
    privacy: 'Messages are archived in MOTIL. Phone alerts do not reveal private message text.',
    refresh: 'Refreshes automatically', choose: 'Choose a conversation',
    read: 'Read', recorded: 'Saved', loading: 'Loading conversations…',
    back: 'Conversations', newLabel: 'New message', chars: '2000 characters maximum',
  },
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data as T;
}
function postJson<T>(url: string, body: unknown) {
  return requestJson<T>(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function displayTime(iso: string, locale: Locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CL',
      { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return ''; }
}
function base64ToBytes(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const text = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export function MotilMessages({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const { data: inbox, error: inboxError, isLoading, mutate: reloadInbox } = useSWR<Inbox>(
    '/api/messages', (url: string) => requestJson<Inbox>(url),
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
  const [preferredThread, setPreferredThread] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [pushStatus, setPushStatus] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [older, setOlder] = useState<Message[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [mobileConversation, setMobileConversation] = useState(false);
  const pendingMessageId = useRef<string | null>(null);
  const acknowledged = useRef<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thread = new URLSearchParams(window.location.search).get('thread');
    if (thread) { setPreferredThread(thread); setMobileConversation(true); }
  }, []);

  const selected = inbox?.conversations.find((c) => c.id === preferredThread)
    || inbox?.conversations.find((c) => c.kind === 'general')
    || inbox?.conversations[0];
  const threadId = selected?.id || null;

  const { data: history, error: historyError, isLoading: loadingHistory, mutate: reloadHistory } = useSWR<History>(
    threadId ? '/api/messages/thread/' + threadId : null,
    (url: string) => requestJson<History>(url),
    { refreshInterval: 4000, revalidateOnFocus: true },
  );

  useEffect(() => { setOlder([]); setStatus(''); pendingMessageId.current = null; }, [threadId]);

  const messages = useMemo(() => {
    const unique = new Map<string, Message>();
    for (const entry of [...older, ...(history?.messages || [])]) unique.set(entry.id, entry);
    return Array.from(unique.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [older, history?.messages]);

  const lastMessage = history?.messages.at(-1);
  useEffect(() => {
    if (!threadId || !lastMessage || document.visibilityState !== 'visible') return;
    if (acknowledged.current[threadId] === lastMessage.id) return;
    acknowledged.current[threadId] = lastMessage.id;
    void postJson('/api/messages/read', { threadId, messageId: lastMessage.id })
      .then(() => reloadInbox())
      .catch(() => { delete acknowledged.current[threadId]; });
  }, [threadId, lastMessage?.id, reloadInbox]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 280) {
      el.scrollTop = el.scrollHeight;
    }
  }, [threadId, lastMessage?.id]);

  const openConversation = (id: string) => {
    setPreferredThread(id);
    setMobileConversation(true);
    setDraft('');
    setStatus('');
    const url = new URL(window.location.href);
    url.searchParams.set('thread', id);
    window.history.replaceState(null, '', url.pathname + url.search);
  };

  const createDirect = async () => {
    if (!recipientId) return;
    setCreating(true); setStatus('');
    try {
      const row = await postJson<{ id: string }>('/api/messages/direct', { recipientId });
      await reloadInbox();
      openConversation(row.id);
      setRecipientId('');
    } catch (error) { setStatus(error instanceof Error ? error.message : t.unavailable); }
    finally { setCreating(false); }
  };

  const send = async () => {
    const text = draft.trim();
    if (!threadId || !text || text.length > 2000 || saving) return;
    const clientMessageId = pendingMessageId.current || crypto.randomUUID();
    pendingMessageId.current = clientMessageId;
    setSaving(true); setStatus('');
    try {
      await postJson('/api/messages', { threadId, text, clientMessageId });
      pendingMessageId.current = null;
      setDraft('');
      await Promise.all([reloadHistory(), reloadInbox()]);
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (error) { setStatus(error instanceof Error ? error.message : t.sendFailure); }
    finally { setSaving(false); }
  };

  const loadOlder = async () => {
    if (!threadId || !history?.hasMore || loadingOlder) return;
    const before = older[0]?.createdAt || history.messages[0]?.createdAt;
    if (!before) return;
    setLoadingOlder(true);
    try {
      const page = await requestJson<History>('/api/messages/thread/' + threadId + '?before=' + encodeURIComponent(before));
      setOlder((current) => [...page.messages, ...current]);
      if (!page.hasMore) {
        // Keep the existing latest page but do not offer another older request.
        setOldestReached(true);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : t.unavailable); }
    finally { setLoadingOlder(false); }
  };
  const [oldestReached, setOldestReached] = useState(false);
  useEffect(() => setOldestReached(false), [threadId]);

  const enablePush = async () => {
    setPushBusy(true); setPushStatus('');
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error(t.pushUnsupported);
      }
      const config = await requestJson<{ publicKey: string | null; configurationError?: string }>('/api/notifications/push');
      if (config.configurationError) throw new Error(config.configurationError);
      if (!config.publicKey) throw new Error(t.pushUnavailable);
      if (Notification.permission === 'denied') throw new Error(t.pushDenied);
      if (await Notification.requestPermission() !== 'granted') throw new Error(t.pushDenied);

      const registration = await Promise.race<ServiceWorkerRegistration>([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, reject) => window.setTimeout(() => reject(new Error(t.pushUnavailable)), 10000)),
      ]);
      await registration.update().catch(() => undefined);
      const publicKey = base64ToBytes(config.publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const previousKey = subscription.options.applicationServerKey;
        const bytes = previousKey ? new Uint8Array(previousKey) : null;
        if (!bytes || bytes.length !== publicKey.length ||
          bytes.some((byte, index) => byte !== publicKey[index])) {
          throw new Error(locale === 'en' ? 'The Push key changed. Reset your browser subscription in notification settings.' :
            'La clave Push cambió. Restablece la suscripción en la página de notificaciones.');
        }
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: publicKey as BufferSource,
        });
      }
      await postJson('/api/notifications/push', subscription.toJSON());
      setPushStatus(t.pushReady);
    } catch (error) { setPushStatus(error instanceof Error ? error.message : t.pushUnavailable); }
    finally { setPushBusy(false); }
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">MOTIL</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void enablePush()} disabled={pushBusy}>
          {pushBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bell className="mr-2 h-4 w-4"/>}
          {t.enablePush}
        </Button>
      </div>
      {pushStatus ? <p className="text-sm" role="status">{pushStatus}</p> : null}
      {inboxError ? (
        <div className="rounded-lg border p-6 text-sm">
          <p>{t.unavailable}</p>
          <Button variant="outline" className="mt-3" onClick={() => void reloadInbox()}>{t.retry}</Button>
        </div>
      ) : isLoading ? (
        <p className="py-8 text-sm text-muted-foreground">{t.loading}</p>
      ) : (
        <div className="grid min-h-[550px] overflow-hidden rounded-xl border bg-card md:grid-cols-[270px_minmax(0,1fr)]">
          <aside className={(mobileConversation ? 'hidden md:flex ' : 'flex ') + 'min-h-0 flex-col border-r'} aria-label={t.back}>
            <div className="border-b p-3">
              <label htmlFor="motil-message-recipient" className="mb-2 block text-xs font-medium text-muted-foreground">{t.newChat}</label>
              <div className="flex gap-2">
                <select id="motil-message-recipient" className="min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
                  <option value="">{t.selectUser}</option>
                  {(inbox?.people || []).map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}
                </select>
                <Button type="button" size="icon" variant="outline" aria-label={t.open} disabled={!recipientId || creating} onClick={() => void createDirect()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
                </Button>
              </div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {inbox?.conversations.length ? inbox.conversations.map((c) =>
                <button key={c.id} type="button" onClick={() => openConversation(c.id)}
                  aria-current={c.id === threadId ? 'page' : undefined}
                  className={'flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ' +
                    (c.id === threadId ? 'bg-primary/10 text-foreground' : 'hover:bg-muted')}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {c.kind === 'general' ? <Users className="h-4 w-4"/> : <MessageCircle className="h-4 w-4"/>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.lastMessage || (c.kind === 'general' ? t.general : t.direct)}</span>
                  </span>
                  {c.unread > 0 ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{c.unread > 99 ? '99+' : c.unread}</span> : null}
                </button>
              ) : <p className="p-4 text-sm text-muted-foreground">{t.noChats}</p>}
            </div>
          </aside>
          <div className={(mobileConversation ? 'flex ' : 'hidden md:flex ') + 'min-w-0 flex-col'}>
            {selected ? (
              <>
                <div className="flex min-h-16 items-center gap-3 border-b px-4 py-3">
                  <Button className="md:hidden" size="icon" variant="ghost" aria-label={t.back} onClick={() => setMobileConversation(false)}>
                    <ChevronLeft className="h-5 w-5"/>
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">{selected.kind === 'general' ? t.general : t.direct} · {t.refresh}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={t.retry} onClick={() => { void reloadInbox(); void reloadHistory(); }}>
                    <RefreshCw className="h-4 w-4"/>
                  </Button>
                </div>
                <div ref={scrollRef} className="min-h-[340px] flex-1 space-y-4 overflow-y-auto bg-muted/10 px-4 py-5" aria-live="polite">
                  {history?.hasMore && !oldestReached ? (
                    <div className="text-center">
                      <Button type="button" variant="ghost" size="sm" disabled={loadingOlder} onClick={() => void loadOlder()}>{t.older}</Button>
                    </div>
                  ) : null}
                  {loadingHistory && !history ? <p className="text-sm text-muted-foreground">{t.loading}</p> : null}
                  {historyError ? <p className="text-sm text-destructive">{t.unavailable}</p> : null}
                  {!messages.length && !loadingHistory && !historyError ? <p className="pt-20 text-center text-sm text-muted-foreground">{t.noMessages}</p> : null}
                  {messages.map((m) => {
                    const own = m.senderId === inbox?.me.id;
                    return <div key={m.id} className={'flex ' + (own ? 'justify-end' : 'justify-start')}>
                      <div className={'max-w-[88%] rounded-xl border px-3 py-2 shadow-sm sm:max-w-[75%] ' +
                        (own ? 'border-primary/15 bg-primary/10' : 'bg-card')}>
                        {!own && <p className="mb-1 text-xs font-semibold">{m.senderName}</p>}
                        <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                          {displayTime(m.createdAt, locale)}
                          {own ? <Check className="h-3 w-3" aria-label={t.recorded}/> : null}
                        </p>
                      </div>
                    </div>;
                  })}
                </div>
                <div className="border-t p-3">
                  {status ? <p role="status" className="mb-2 text-xs text-destructive">{status}</p> : null}
                  <div className="flex items-end gap-2">
                    <textarea aria-label={t.placeholder} placeholder={t.placeholder} value={draft}
                      maxLength={2000} rows={2} disabled={saving}
                      onChange={(event) => { setDraft(event.target.value); pendingMessageId.current = null; }}
                      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
                      className="max-h-40 min-h-14 min-w-0 flex-1 resize-y rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
                    <Button type="button" className="min-h-12" disabled={!draft.trim() || saving} onClick={() => void send()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                      <span className="ml-2 hidden sm:inline">{saving ? t.sending : t.send}</span>
                    </Button>
                  </div>
                </div>
              </>
            ) : <p className="m-auto p-6 text-sm text-muted-foreground">{t.choose}</p>}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t.privacy}</p>
    </section>
  );
}
