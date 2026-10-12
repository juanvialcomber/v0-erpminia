import { getDictionaryForRequest } from '@/lib/i18n/server';
import { MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkOrderDetail } from '@/components/maintenance/work-order-detail';
import { WorkOrderCommunications } from '@/components/maintenance/work-order-communications';

export default async function WorkOrderDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { locale, dictionary } = await getDictionaryForRequest();
  const { id } = await params;

  return (
    <div className="space-y-5">
      <div className="mx-auto flex w-full max-w-5xl justify-end">
        <Button asChild variant="outline" size="sm">
          <a href="#motil-wo-communications" aria-label={locale === 'en' ? 'Jump to work order conversations' : 'Ir a comunicaciones de la OT'}>
            <MessageSquareText className="mr-2 h-4 w-4"/>
            {locale === 'en' ? 'OT messages' : 'Mensajes OT'}
          </a>
        </Button>
      </div>
      <WorkOrderDetail locale={locale} dictionary={dictionary} />
      <div className="mx-auto w-full max-w-5xl">
        <WorkOrderCommunications workOrderId={id} locale={locale} />
      </div>
    </div>
  );
}
