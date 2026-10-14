import { getDictionaryForRequest } from '@/lib/i18n/server';
import { ComfortableOperationalCalendar } from '@/components/operational-calendar/comfortable-operational-calendar';

export default async function TareasPage() {
  await getDictionaryForRequest();
  return <ComfortableOperationalCalendar />;
}
