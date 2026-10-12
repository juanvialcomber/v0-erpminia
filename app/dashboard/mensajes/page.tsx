import { Suspense } from 'react';
import { getDictionaryForRequest } from '@/lib/i18n/server';
import { MotilMessages } from '@/components/messages/motil-messages';

export default async function MessagesPage() {
  const { locale } = await getDictionaryForRequest();
  return (
    <Suspense fallback={<p className="py-8 text-sm text-muted-foreground">MOTIL · Mensajes</p>}>
      <MotilMessages locale={locale} />
    </Suspense>
  );
}
