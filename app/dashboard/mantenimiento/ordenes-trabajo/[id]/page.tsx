import { getDictionaryForRequest } from '@/lib/i18n/server';
import { WorkOrderDetail } from '@/components/maintenance/work-order-detail';
import { WorkOrderCommunications } from '@/components/maintenance/work-order-communications';

export default async function WorkOrderDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { locale, dictionary } = await getDictionaryForRequest();
  const { id } = await params;

  return (
    <div className="space-y-5">
      <WorkOrderDetail locale={locale} dictionary={dictionary} />
      <div className="mx-auto w-full max-w-5xl">
        <WorkOrderCommunications workOrderId={id} locale={locale} />
      </div>
    </div>
  );
}
