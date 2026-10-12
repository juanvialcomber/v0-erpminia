'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowUpRight, MessageSquareText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecipientSearch } from '@/components/messages/recipient-search';
import type { Locale } from '@/lib/i18n/dictionaries';

type WorkOrderConversations = {
  order: { id: string; number: string; title: string };
  conversations: Array<{ threadId: string; participantName: string; linkedAt: string | null }>;
};
async function fetchWorkOrderConversations(url: string): Promise<WorkOrderConversations> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar las conversaciones');
  return payload as WorkOrderConversations;
}

export function WorkOrderCommunications({ workOrderId, locale }: { workOrderId: string; locale: Locale }) {
  const es = locale !== 'en';
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<WorkOrderConversations>(
    workOrderId ? '/api/messages/work-order-contexts?workOrderId=' + encodeURIComponent(workOrderId) : null,
    fetchWorkOrderConversations, { refreshInterval: 12000, revalidateOnFocus: true },
  );
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState('');

  const openWithPerson = async (recipientId: string) => {
    if (creating) return;
    setCreating(true);
    setCreationError('');
    try {
      const response = await fetch('/api/messages/work-order-contexts', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId, recipientId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ||
        (es ? 'No se pudo abrir la conversación' : 'Could not open conversation'));
      await mutate();
      router.push('/dashboard/mensajes?thread=' + encodeURIComponent(result.threadId) +
        '&workOrder=' + encodeURIComponent(workOrderId));
    } catch (cause) {
      setCreationError(cause instanceof Error ? cause.message :
        (es ? 'No se pudo vincular la conversación' : 'Could not link the conversation'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card id="motil-wo-communications" className="scroll-mt-20 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4"/>
          {es ? 'Comunicaciones de esta OT' : 'Work order communications'}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {es
            ? 'Conserva las conversaciones en Mensajes, sin duplicar el historial ni modificar la OT.'
            : 'Keep conversations in Messages without duplicating history or changing the work order.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">
          {es ? 'Cargando conversaciones…' : 'Loading conversations…'}
        </p> : error ? <p className="text-sm text-muted-foreground" role="status">
          {es ? 'Las conversaciones no están disponibles para esta OT.' : 'Conversations are unavailable for this work order.'}
        </p> : (
          <>
            <RecipientSearch locale={locale} busy={creating} onSelect={(id) => { void openWithPerson(id); }}/>
            {creationError ? <p className="text-sm text-destructive" role="alert">{creationError}</p> : null}
            {data?.conversations.length ? (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {es ? 'Conversaciones vinculadas' : 'Linked conversations'}
                </p>
                {data.conversations.map((item) => (
                  <Link key={item.threadId}
                    href={'/dashboard/mensajes?thread=' + encodeURIComponent(item.threadId) +
                      '&workOrder=' + encodeURIComponent(workOrderId)}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
                    <span className="min-w-0 truncate">{item.participantName}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground"/>
                  </Link>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">
              {es
                ? 'Sin conversaciones vinculadas. Busca un compañero para abrir su chat.'
                : 'No linked conversations. Search for a coworker to open their chat.'}
            </p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
