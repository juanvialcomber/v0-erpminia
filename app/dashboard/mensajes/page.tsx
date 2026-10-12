import { getDictionaryForRequest } from '@/lib/i18n/server';
import { MotilMessages } from '@/components/messages/motil-messages';

export default async function MessagesPage() {
  const { locale } = await getDictionaryForRequest();
  return <MotilMessages locale={locale} />;
}
