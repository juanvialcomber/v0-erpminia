import { getDictionaryForRequest } from '@/lib/i18n/server';
import { ActionsInbox } from '@/components/actions/actions-inbox';
import { MotilCommitments } from '@/components/actions/motil-commitments';

export default async function AccionesPage() {
  const { locale, dictionary } = await getDictionaryForRequest();
  return <div className="space-y-6"><MotilCommitments /><ActionsInbox locale={locale} dictionary={dictionary} /></div>;
}
