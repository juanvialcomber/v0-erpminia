'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowUpRight, MessageSquareText } from 'lucide-react';
import { RecipientSearch } from '@/components/messages/recipient-search';
import type { Locale } from '@/lib/i18n/dictionaries';

type AssetConversations = {
  asset: { id: string; code: string; name: string };
  conversations: Array<{ threadId: string; participantName: string; linkedAt: string | null }>;
};

async function loadConversations(url: string): Promise<AssetConversations> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'No se pudieron cargar las conversaciones');
  return result as AssetConversations;
}

/**
 * Small, lazy section for the canonical 360 ficha. The durable messages always
 * live in /dashboard/mensajes, never in a second asset-specific chat ledger.
 */
export function AssetCommunications({ assetId, locale }: { assetId: string; locale: Locale }) {
  const es = locale !== 'en';
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    const revealFromChat = () => {
      if (window.location.hash !== '#motil-asset-communications') return;
      const section = detailsRef.current;
      if (!section) return;
      section.open = true;
      setExpanded(true);
      window.requestAnimationFrame(() => section.scrollIntoView({ block: 'start' }));
    };
    revealFromChat();
    window.addEventListener('hashchange', revealFromChat);
    return () => window.removeEventListener('hashchange', revealFromChat);
  }, []);

  const { data, error, isLoading, mutate } = useSWR<AssetConversations>(
    expanded && assetId
      ? '/api/messages/asset-contexts?assetId=' + encodeURIComponent(assetId) : null,
    loadConversations,
    { refreshInterval: 12000, revalidateOnFocus: true },
  );

  const openConversationWith = async (recipientId: string) => {
    if (creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const response = await fetch('/api/messages/asset-contexts', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, recipientId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ||
        (es ? 'No se pudo abrir la conversación' : 'Could not open conversation'));
      await mutate();
      router.push('/dashboard/mensajes?thread=' + encodeURIComponent(payload.threadId) +
        '&asset=' + encodeURIComponent(assetId));
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message :
        (es ? 'No se pudo vincular el activo' : 'Could not link this asset'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <details ref={detailsRef} id="motil-asset-communications" className="scroll-mt-20 rounded-lg border bg-card"
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="flex min-h-14 cursor-pointer list-item items-center px-5 py-4 text-sm font-medium">
        <MessageSquareText className="mr-2 inline h-4 w-4 align-text-bottom" />
        {es ? 'Mensajes del activo' : 'Asset messages'}
      </summary>
      {expanded ? (
        <div className="space-y-3 border-t px-5 py-4">
          <p className="text-xs text-muted-foreground">
            {es ? 'Abre el chat oficial con un compañero. El historial permanece en Mensajes.'
              : 'Open the official chat with a coworker. History remains in Messages.'}
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {es ? 'Cargando conversaciones…' : 'Loading conversations…'}
            </p>
          ) : error ? (
            <p role="status" className="text-sm text-muted-foreground">
              {es ? 'No fue posible cargar los mensajes de este activo.' :
                'Could not load conversations for this asset.'}
            </p>
          ) : (
            <>
              <RecipientSearch locale={locale} busy={creating}
                onSelect={(personId) => { void openConversationWith(personId); }} />
              {createError ? <p className="text-sm text-destructive" role="alert">{createError}</p> : null}
              {data?.conversations.length ? (
                <div className="space-y-1 border-t pt-3">
                  <p className="pb-1 text-xs text-muted-foreground">
                    {es ? 'Conversaciones vinculadas' : 'Linked conversations'}
                  </p>
                  {data.conversations.map((item) => (
                    <Link key={item.threadId}
                      href={'/dashboard/mensajes?thread=' + encodeURIComponent(item.threadId) +
                        '&asset=' + encodeURIComponent(assetId)}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                      <span className="min-w-0 truncate">{item.participantName}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground"/>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {es ? 'No hay conversaciones vinculadas. Busca un compañero para comenzar.'
                    : 'No linked conversations. Search for a coworker to start.'}
                </p>
              )}
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}
