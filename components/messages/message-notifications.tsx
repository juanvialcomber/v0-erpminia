'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { MessageSquare } from 'lucide-react';
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

export function MessageNotifications({ locale }: { locale: Locale }) {
  const { data, error } = useUnreadMessages();
  const es = locale !== 'en';
  const title = es ? 'Mensajes' : 'Messages';
  const number = data?.totalUnread || 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm"
          className="relative" aria-label={
            number ? `${title}: ${number} ${es ? 'sin leer' : 'unread'}` : title
          } title={title}>
          <MessageSquare className="h-4 w-4"/>
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
        {error ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {es ? 'No se pudo consultar la bandeja.' : 'Could not load the inbox.'}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
