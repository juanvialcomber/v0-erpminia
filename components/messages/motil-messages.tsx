'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { RecipientSearch } from '@/components/messages/recipient-search';
import { ArrowDown, Bell, Check, CheckCheck, ChevronLeft, Loader2, MessageCircle, RefreshCw, Search, Send, Users, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/dictionaries';

type Person = { id: string; name: string };
type Conversation = {
  id: string; kind: 'general' | 'direct'; name: string; contactId: string | null;
  unread: number; lastMessage: string | null; lastMessageAt: string | null;
};
type Inbox = { me: Person; conversations: Conversation[] };
type Message = {
  id: string; senderId: string; senderName: string; text: string; createdAt: string;
  readByRecipient?: boolean; readCount?: number | null; recipientCount?: number | null;
  pushStatus?: string | null;
};
type History = { messages: Message[]; hasMore: boolean; peerLastReadAt?: string | null };
type SearchResult = {
  id: string; threadId: string; threadName: string; senderName: string;
  kind: 'general' | 'direct'; text: string; createdAt: string;
};
type SearchResponse = { results: SearchResult[] };
type ChatWorkOrderContext = {
  id: string; number: string; title: string; status: string | null; linkedAt: string;
};
type ChatWorkOrderContexts = { contexts: ChatWorkOrderContext[] };

const copy = {
  es: {
    title: 'Mensajes', subtitle: 'Conversaciones de tu organización',
    newChat: 'Mensaje directo', selectUser: 'Seleccionar persona', open: 'Abrir',
    openingChat: 'Abriendo conversación privada…', pendingChat: 'La conversación privada no está abierta. No se enviará a General.',
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
    allConversations: 'Todos', unreadConversations: 'Sin leer', noneUnread: 'Sin mensajes pendientes.',
    awaitingRead: 'Pendiente de lectura', readBy: 'Leído por', pushUnavailableLabel: 'Aviso móvil no confirmado',
    newest: 'Ir a mensajes recientes', newUnread: 'Nuevos mensajes',
    search: 'Buscar mensajes', searchPlaceholder: 'Buscar en conversaciones…',
    searchHint: 'Escribe al menos 2 caracteres', searching: 'Buscando…',
    searchEmpty: 'No hay mensajes que coincidan.', searchError: 'No se pudo buscar. Reintenta.',
    located: 'Mensaje encontrado', returnToRecent: 'Volver a recientes',
    relatedWorkOrders: 'Órdenes de trabajo vinculadas',
  },
  en: {
    title: 'Messages', subtitle: 'Your organization conversations',
    newChat: 'Direct message', selectUser: 'Select a colleague', open: 'Open',
    openingChat: 'Opening private conversation…', pendingChat: 'The private conversation is not open. This will not be sent to General.',
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
    allConversations: 'All', unreadConversations: 'Unread', noneUnread: 'No unread messages.',
    awaitingRead: 'Awaiting read', readBy: 'Read by', pushUnavailableLabel: 'Phone alert unconfirmed',
    newest: 'Go to recent messages', newUnread: 'New messages',
    search: 'Search messages', searchPlaceholder: 'Search conversations…',
    searchHint: 'Enter at least 2 characters', searching: 'Searching…',
    searchEmpty: 'No matching messages.', searchError: 'Search failed. Retry.',
    located: 'Found message', returnToRecent: 'Back to recent',
    relatedWorkOrders: 'Linked work orders',
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
function displayDate(iso: string, locale: Locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CL',
      { dateStyle: 'medium' }).format(new Date(iso));
  } catch { return ''; }
}
function base64ToBytes(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const text = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export function MotilMessages({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data: inbox, error: inboxError, isLoading, mutate: reloadInbox } = useSWR<Inbox>(
    '/api/messages', (url: string) => requestJson<Inbox>(url),
    { refreshInterval: 6000, revalidateOnFocus: true },
  );
  const [preferredThread, setPreferredThread] = useState<string | null>(null);
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const activeThreadRef = useRef<string | null>(null);
  const pendingOlderScrollRef = useRef<{ threadId: string; height: number; top: number } | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pendingMessageId = useRef<string | null>(null);
  const acknowledged = useRef<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const thread = searchParams.get('thread');
    setPreferredThread(thread);
    setTargetMessageId(searchParams.get('message'));
    setMobileConversation(Boolean(thread));
  }, [searchParams]);

  // Never silently open General: simply visiting Messages must not
  // mark the organization's channel as read.
  const selected = preferredThread
    ? inbox?.conversations.find((conversation) => conversation.id === preferredThread)
    : undefined;
  const threadId = selected?.id || null;
  const requestedWorkOrder = searchParams.get('workOrder');
  const { data: workOrderContexts } = useSWR<ChatWorkOrderContexts>(
    threadId && selected?.kind === 'direct'
      ? '/api/messages/work-order-contexts?threadId=' + encodeURIComponent(threadId) : null,
    (url: string) => requestJson<ChatWorkOrderContexts>(url),
    { revalidateOnFocus: true, refreshInterval: 30000 },
  );

  const { data: history, error: historyError, isLoading: loadingHistory, mutate: reloadHistory } = useSWR<History>(
    threadId ? '/api/messages/thread/' + threadId +
      (targetMessageId ? '?anchor=' + encodeURIComponent(targetMessageId) : '') : null,
    (url: string) => requestJson<History>(url),
    { refreshInterval: 4000, revalidateOnFocus: true },
  );

  useEffect(() => {
    setOlder([]);
    setStatus('');
    pendingMessageId.current = null;
    pendingOlderScrollRef.current = null;
  }, [threadId, targetMessageId]);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearchTerm(searchText.trim()), 280);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const { data: searchData, error: searchError, isLoading: searching } = useSWR<SearchResponse>(
    searchOpen && searchTerm.length >= 2
      ? '/api/messages/search?q=' + encodeURIComponent(searchTerm) : null,
    (url: string) => requestJson<SearchResponse>(url),
    { revalidateOnFocus: false, keepPreviousData: false },
  );

  const messages = useMemo(() => {
    const unique = new Map<string, Message>();
    for (const entry of [...older, ...(history?.messages || [])]) unique.set(entry.id, entry);
    return Array.from(unique.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [older, history?.messages]);

  const lastMessage = history?.messages.at(-1);

  const updateScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom !== atBottomRef.current) {
      atBottomRef.current = nearBottom;
      setAtBottom(nearBottom);
    }
  }, []);

  const jumpToRecent = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // Keep the viewer's position when an old page is prepended. Otherwise a
  // 40-message history load jumps the user away from what they were reading.
  useLayoutEffect(() => {
    const pending = pendingOlderScrollRef.current;
    const el = scrollRef.current;
    if (!pending || pending.threadId !== threadId || !el) return;
    el.scrollTop = pending.top + el.scrollHeight - pending.height;
    pendingOlderScrollRef.current = null;
    updateScrollPosition();
  }, [older, threadId, updateScrollPosition]);

  useEffect(() => {
    if (!threadId) {
      activeThreadRef.current = null;
      return;
    }
    const viewportKey = threadId + ':' + (targetMessageId || 'latest');
    if (activeThreadRef.current !== viewportKey) {
      activeThreadRef.current = viewportKey;
      atBottomRef.current = true;
      setAtBottom(true);
    }
    // Automatically follow new messages only while the viewer is already
    // near the bottom. Never pull them out of historical messages.
    if (atBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [threadId, targetMessageId, lastMessage?.id]);

  const acknowledgeVisibleMessage = useCallback(() => {
    if (!threadId || !lastMessage || document.visibilityState !== 'visible' ||
        !document.hasFocus() || !atBottomRef.current) return;
    if (window.matchMedia('(max-width: 767px)').matches && !mobileConversation) return;
    if (acknowledged.current[threadId] === lastMessage.id) return;
    acknowledged.current[threadId] = lastMessage.id;
    void postJson('/api/messages/read', { threadId, messageId: lastMessage.id })
      .then(() => Promise.all([reloadInbox(), mutateGlobal('/api/messages/unread')]))
      .catch(() => { delete acknowledged.current[threadId]; });
  }, [threadId, lastMessage?.id, mobileConversation, reloadInbox, mutateGlobal]);

  useEffect(() => {
    acknowledgeVisibleMessage();
    document.addEventListener('visibilitychange', acknowledgeVisibleMessage);
    window.addEventListener('focus', acknowledgeVisibleMessage);
    return () => {
      document.removeEventListener('visibilitychange', acknowledgeVisibleMessage);
      window.removeEventListener('focus', acknowledgeVisibleMessage);
    };
  }, [acknowledgeVisibleMessage, atBottom]);

  const openConversation = (id: string, messageId?: string) => {
    setPreferredThread(id);
    setTargetMessageId(messageId || null);
    setMobileConversation(true);
    setDraft('');
    setStatus('');
    router.replace('/dashboard/mensajes?thread=' + encodeURIComponent(id) +
      (messageId ? '&message=' + encodeURIComponent(messageId) : ''), { scroll: false });
    if (!messageId) window.setTimeout(() => composerRef.current?.focus(), 80);
  };

  const createDirect = async (targetId: string) => {
    if (!targetId) return;
    setCreating(true); setStatus('');
    try {
      const row = await postJson<{ id: string }>('/api/messages/direct', { recipientId: targetId });
      await reloadInbox();
      openConversation(row.id);
      setRecipientId('');
    } catch (error) {
      setRecipientId('');
      setStatus(error instanceof Error ? error.message : t.unavailable);
    } finally { setCreating(false); }
  };

  const send = async () => {
    const text = draft.trim();
    if (!threadId || !text || text.length > 2000 || saving || creating || recipientId) return;
    const clientMessageId = pendingMessageId.current || crypto.randomUUID();
    pendingMessageId.current = clientMessageId;
    setSaving(true); setStatus('');
    try {
      await postJson('/api/messages', { threadId, text, clientMessageId });
      pendingMessageId.current = null;
      setDraft('');
      await Promise.all([reloadHistory(), reloadInbox(), mutateGlobal('/api/messages/unread')]);
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (error) { setStatus(error instanceof Error ? error.message : t.sendFailure); }
    finally { setSaving(false); }
  };

  const loadOlder = async () => {
    if (!threadId || !history?.hasMore || loadingOlder) return;
    const beforeId = older[0]?.id || history.messages[0]?.id;
    if (!beforeId) return;
    setLoadingOlder(true);
    try {
      const page = await requestJson<History>('/api/messages/thread/' + threadId +
        '?beforeId=' + encodeURIComponent(beforeId));
      const viewport = scrollRef.current;
      if (viewport && page.messages.length > 0) {
        pendingOlderScrollRef.current = {
          threadId, top: viewport.scrollTop, height: viewport.scrollHeight,
        };
      }
      setOlder((current) => [...page.messages, ...current]);
      if (!page.hasMore || page.messages.length === 0) setOldestReached(true);
    } catch (error) {
      pendingOlderScrollRef.current = null;
      setStatus(error instanceof Error ? error.message : t.unavailable);
    } finally { setLoadingOlder(false); }
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

  const totalUnread = (inbox?.conversations || []).reduce((total, conversation) => total + conversation.unread, 0);
  const visibleConversations = (inbox?.conversations || []).filter(
    (conversation) => !unreadOnly || conversation.unread > 0 || conversation.id === threadId,
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">MOTIL</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm"
            onClick={() => setSearchOpen((previous) => !previous)}
            aria-expanded={searchOpen} aria-controls="motil-message-search">
            <Search className="mr-2 h-4 w-4"/>{t.search}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void enablePush()} disabled={pushBusy}>
            {pushBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bell className="mr-2 h-4 w-4"/>}
            {t.enablePush}
          </Button>
        </div>
      </div>
      {pushStatus ? <p className="text-sm" role="status">{pushStatus}</p> : null}
      {searchOpen ? (
        <section id="motil-message-search" aria-label={t.search} className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground"/>
            <input type="search" aria-label={t.search} autoFocus
              value={searchText} maxLength={80} placeholder={t.searchPlaceholder}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"/>
            <Button type="button" variant="ghost" size="icon" aria-label={t.back}
              onClick={() => { setSearchOpen(false); setSearchText(''); }}>
              <X className="h-4 w-4"/>
            </Button>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto border-t pt-2" role="list">
            {searchText.trim().length < 2 ? (
              <p className="p-3 text-xs text-muted-foreground">{t.searchHint}</p>
            ) : searching || searchText.trim() !== searchTerm ? (
              <p className="p-3 text-xs text-muted-foreground">{t.searching}</p>
            ) : searchError ? (
              <p className="p-3 text-xs text-destructive">{t.searchError}</p>
            ) : searchData?.results.length ? (
              searchData.results.map((result) => (
                <button key={result.id} type="button" role="listitem"
                  onClick={() => {
                    openConversation(result.threadId, result.id);
                    setSearchOpen(false);
                    setSearchText('');
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted">
                  <span className="block truncate text-xs font-medium">
                    {result.threadName} · {result.senderName} · {displayDate(result.createdAt, locale)}
                  </span>
                  <span className="mt-1 block line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {result.text}
                  </span>
                </button>
              ))
            ) : <p className="p-3 text-xs text-muted-foreground">{t.searchEmpty}</p>}
          </div>
        </section>
      ) : null}
      {inboxError ? (
        <div className="rounded-lg border p-6 text-sm">
          <p>{t.unavailable}</p>
          <Button variant="outline" className="mt-3" onClick={() => void reloadInbox()}>{t.retry}</Button>
        </div>
      ) : isLoading ? (
        <p className="py-8 text-sm text-muted-foreground">{t.loading}</p>
      ) : (
        <div className="grid h-[min(74vh,760px)] min-h-[430px] overflow-hidden rounded-xl border bg-card md:min-h-[520px] md:grid-cols-[270px_minmax(0,1fr)]">
          <aside className={(mobileConversation ? 'hidden md:flex ' : 'flex ') + 'min-h-0 flex-col border-r'} aria-label={t.back}>
            <div className="border-b p-3">
              <RecipientSearch locale={locale} busy={creating} onSelect={(targetId) => {
                setRecipientId(targetId);
                void createDirect(targetId);
              }}/>
              {recipientId ? <p role="status" className="mt-2 text-xs text-muted-foreground">
                {creating ? t.openingChat : t.pendingChat}
              </p> : null}
              {status && !selected ? <p role="status" className="mt-2 text-xs text-destructive">{status}</p> : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
              <button type="button" className={!unreadOnly ? 'font-semibold text-foreground' : 'text-muted-foreground'}
                onClick={() => setUnreadOnly(false)}>{t.allConversations}</button>
              <button type="button" className={unreadOnly ? 'font-semibold text-foreground' : 'text-muted-foreground'}
                onClick={() => setUnreadOnly(true)}>
                {t.unreadConversations}{totalUnread > 0 ? ` (${totalUnread})` : ''}
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {visibleConversations.length ? visibleConversations.map((c) =>
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
              ) : <p className="p-4 text-sm text-muted-foreground">{unreadOnly ? t.noneUnread : t.noChats}</p>}
            </div>
          </aside>
          <div className={(mobileConversation ? 'flex ' : 'hidden md:flex ') + 'min-h-0 min-w-0 flex-col'}>
            {selected ? (
              <>
                <div className="flex min-h-16 items-center gap-3 border-b px-4 py-3">
                  <Button className="md:hidden" size="icon" variant="ghost" aria-label={t.back} onClick={() => setMobileConversation(false)}>
                    <ChevronLeft className="h-5 w-5"/>
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.kind === 'general' ? t.general : t.direct} · {targetMessageId ? t.located : t.refresh}
                    </p>
                  </div>
                  {targetMessageId ? (
                    <Button type="button" variant="outline" size="sm" className="shrink-0"
                      onClick={() => openConversation(selected.id)}>{t.returnToRecent}</Button>
                  ) : null}
                  <Button size="icon" variant="ghost" aria-label={t.retry} onClick={() => { void reloadInbox(); void reloadHistory(); }}>
                    <RefreshCw className="h-4 w-4"/>
                  </Button>
                </div>
                {workOrderContexts?.contexts.length ? (
                  <div className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2 text-xs"
                    aria-label={t.relatedWorkOrders}>
                    <Wrench className="h-4 w-4 shrink-0 text-muted-foreground"/>
                    {workOrderContexts.contexts.map((order) => (
                      <Link key={order.id}
                        href={'/dashboard/mantenimiento/ordenes-trabajo/' + encodeURIComponent(order.id)}
                        title={order.title}
                        className={'shrink-0 rounded-md border px-2 py-1 font-medium hover:bg-muted ' +
                          (requestedWorkOrder === order.id ? 'border-primary/50 bg-primary/10' : '')}>
                        {order.number}
                      </Link>
                    ))}
                  </div>
                ) : null}
                <div className="relative min-h-0 flex-1">
                  <div ref={scrollRef} onScroll={updateScrollPosition}
                    className="h-full space-y-4 overflow-y-auto bg-muted/10 px-4 py-5" aria-live="polite">
                  {history?.hasMore && !oldestReached ? (
                    <div className="text-center">
                      <Button type="button" variant="ghost" size="sm" disabled={loadingOlder} onClick={() => void loadOlder()}>{t.older}</Button>
                    </div>
                  ) : null}
                  {loadingHistory && !history ? <p className="text-sm text-muted-foreground">{t.loading}</p> : null}
                  {historyError ? <p className="text-sm text-destructive">{t.unavailable}</p> : null}
                  {!messages.length && !loadingHistory && !historyError ? <p className="pt-20 text-center text-sm text-muted-foreground">{t.noMessages}</p> : null}
                  {messages.map((m, index) => {
                    const own = m.senderId === inbox?.me.id;
                    const previousDay = index ? new Date(messages[index - 1].createdAt).toDateString() : null;
                    const day = new Date(m.createdAt).toDateString();
                    return <div key={m.id} className="space-y-3">
                      {previousDay !== day ? (
                        <div role="separator" className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                          <span className="h-px flex-1 bg-border"/>
                          <time dateTime={m.createdAt}>{displayDate(m.createdAt, locale)}</time>
                          <span className="h-px flex-1 bg-border"/>
                        </div>
                      ) : null}
                      <div className={'flex ' + (own ? 'justify-end' : 'justify-start')}>
                        <div className={'max-w-[88%] rounded-xl border px-3 py-2 shadow-sm sm:max-w-[75%] ' +
                        (own ? 'border-primary/15 bg-primary/10' : 'bg-card') +
                          (m.id === targetMessageId ? ' ring-2 ring-primary' : '')}>
                        {!own && <p className="mb-1 text-xs font-semibold">{m.senderName}</p>}
                        <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
                        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                          {displayTime(m.createdAt, locale)}
                          {own ? (m.readByRecipient
                            ? <CheckCheck className="h-3.5 w-3.5" aria-label={t.read}/>
                            : <Check className="h-3 w-3" aria-label={t.recorded}/>) : null}
                          {own ? (selected.kind === 'direct'
                            ? (m.readByRecipient ? t.read : t.awaitingRead)
                            : m.recipientCount != null && m.recipientCount > 0
                              ? `${t.readBy} ${m.readCount || 0}/${m.recipientCount}` : t.recorded) : null}
                        </p>
                        {own && selected.kind === 'direct' &&
                          ['retry', 'skipped', 'failed'].includes(m.pushStatus || '') ? (
                          <p className="mt-1 text-[10px] text-muted-foreground" title={t.pushUnavailableLabel}>
                            {t.pushUnavailableLabel}
                          </p>
                        ) : null}
                        </div>
                      </div>
                    </div>;
                  })}
                  </div>
                  {!atBottom && !targetMessageId && messages.length > 0 ? (
                    <Button type="button" size="sm" variant="secondary"
                      className="absolute bottom-3 right-3 gap-2 border shadow-md"
                      onClick={jumpToRecent} aria-label={t.newest}>
                      <ArrowDown className="h-4 w-4"/>
                      {selected.unread > 0 ? `${t.newUnread} (${selected.unread})` : t.newest}
                    </Button>
                  ) : null}
                </div>
                <div className="border-t p-3">
                  {status ? <p role="status" className="mb-2 text-xs text-destructive">{status}</p> : null}
                  <div className="flex items-end gap-2">
                    <textarea ref={composerRef} aria-label={t.placeholder} placeholder={t.placeholder} value={draft}
                      maxLength={2000} rows={2} disabled={saving || creating || Boolean(recipientId)}
                      onChange={(event) => { setDraft(event.target.value); pendingMessageId.current = null; }}
                      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
                      className="max-h-40 min-h-14 min-w-0 flex-1 resize-y rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
                    <Button type="button" className="min-h-12" disabled={!draft.trim() || saving || creating || Boolean(recipientId)} onClick={() => void send()}>
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
