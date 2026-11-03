import { ProgressiveInvoiceWorkflow } from '@/components/procurement/progressive-invoice-workflow';
import { LaudusPurchaseDocuments } from '@/components/integrations/laudus-purchase-documents';

export default function SupplierInvoicesPage() {
  return <div className="space-y-6"><ProgressiveInvoiceWorkflow /><LaudusPurchaseDocuments /></div>;
}
