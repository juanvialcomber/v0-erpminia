'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Locale } from '@/lib/i18n/dictionaries';

export type UnreadMessages = {
  totalUnread: number;
  unreadConversations: number;
  conversations: Array<{
    id: string; kind: 'general' | 'direct'; name: string; unread: number;
    lastMessage: string | null; lastMessageAt: string | null;
  }>;
};

async function fetchUnread(url: string): Promise<UnreadMessages> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('Unread messages unavailable');
  return response.json() as Promise<UnreadMessages>;
}

export function useUnreadMessages() {
  return useSWR<UnreadMessages>('/api/messages/unread', fetchUnread, {
    refreshInterval: 6000,
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });
}

function Count({ count }: { count: number }) {
  return <span className="inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
    aria-label={String(count)}>
    {count > 99 ? '99+' : count}
  </span>;
}

export function MessageUnreadBadge() {
  const { data } = useUnreadMessages();
  if (!data?.totalUnread) return null;
  return <Count count={data.totalUnread} />;
}

export function MessageNotifications({
  locale, showOperationalAlerts = false,
}: { locale: Locale; showOperationalAlerts?: boolean }) {
  const { data, error, isLoading, mutate } = useUnreadMessages();
  const es = locale !== 'en';
  const title = es ? 'Notificaciones' : 'Notifications';
  const number = data?.totalUnread || 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm"
          className="relative" aria-label={
            number ? `${title}: ${number} ${es ? (number === 1 ? 'mensaje sin leer' : 'mensajes sin leer') : (number === 1 ? 'unread message' : 'unread messages')}` : title
          } title={title}>
          <Bell className="h-4 w-4"/>
          {number > 0 ? (
            <span className="absolute -right-1 -top-1"><Count count={number}/></span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(90vw,340px)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-3">
          <span>{title}</span>
          {number ? <span className="text-xs font-normal text-muted-foreground">
            {number} {es ? 'sin leer' : 'unread'}
          </span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator/>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {es ? 'Mensajes sin leer' : 'Unread messages'}
        </DropdownMenuLabel>
        {error ? (
          <div role="alert" className="flex items-center justify-between gap-2 px-2 py-3">
            <p className="text-xs text-muted-foreground">
              {es ? 'No se pudo consultar la bandeja.' : 'Could not load the inbox.'}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
              {es ? 'Reintentar' : 'Retry'}
            </Button>
          </div>
        ) : isLoading || !data ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {es ? 'Consultando mensajes…' : 'Checking messages…'}
          </p>
        ) : data?.conversations.length ? (
          data.conversations.map((conversation) =>
            <DropdownMenuItem asChild key={conversation.id} className="cursor-pointer">
              <Link href={`/dashboard/mensajes?thread=${encodeURIComponent(conversation.id)}`}
                className="flex min-w-0 items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{conversation.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {conversation.lastMessage || (es ? 'Mensaje nuevo' : 'New message')}
                  </span>
                </span>
                <Count count={conversation.unread}/>
              </Link>
            </DropdownMenuItem>
          )
        ) : (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {es ? 'No tienes mensajes sin leer.' : 'You have no unread messages.'}
          </p>
        )}
        <DropdownMenuSeparator/>
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/dashboard/mensajes">
            {es ? 'Abrir todas las conversaciones' : 'Open all conversations'}
          </Link>
        </DropdownMenuItem>
        {showOperationalAlerts ? (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/dashboard/alertas">
              {es ? 'Ver alertas operacionales' : 'View operational alerts'}
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
