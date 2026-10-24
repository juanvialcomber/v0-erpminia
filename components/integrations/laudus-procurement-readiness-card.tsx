'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, ReceiptText, ShoppingCart } from 'lucide-react';

type Payload = {
  orders: {
    total: number;
    supplierCoverage: number;
    costCenterCoverage: number;
    amountCoverage: number;
    currencyCoverage: number;
  };
  lines: {
    total: number;
    productCoverage: number;
    quantityCoverage: number;
    costCoverage: number;
    unitCoverage: number;
    receivedCoverage: number;
    costCenterCoverage: number;
    assetCoverage: number;
  };
  flow: {
    receipts: number;
    receiptLines: number;
    receiptOrderCoverage: number;
    receiptLineOrderCoverage: number;
    invoices: number;
    invoiceLines: number;
    invoiceOrderCoverage: number;
    invoiceSupplierCoverage: number;
    invoiceLineOrderCoverage: number;
    payables: number;
    payableInvoiceCoverage: number;
    payments: number;
    paymentPayableCoverage: number;
    dtes: number;
    dteInvoiceCoverage: number;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular preparación de Compras.');
  return payload;
};

const fmt = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

export function LaudusProcurementReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/procurement-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  const orderRisk = data ? data.orders.supplierCoverage < 90 || data.orders.costCenterCoverage < 90 : false;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Preparación histórica para Laudus</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Mide qué tan reconciliable está el histórico de compras de MOTIL antes de conectar el ERP.
        </p>
      </div>

      <div className="grid gap-px bg-border md:grid-cols-2">
        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            {orderRisk ? <AlertTriangle className="h-4 w-4 text-muted-foreground" /> : <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
            <p className="text-sm font-medium">Cabeceras de OC</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.orders.total.toLocaleString('es-CL')}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.orders.supplierCoverage)}</p><p>Proveedor enlazado</p></div>
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.orders.costCenterCoverage)}</p><p>Centro de costo</p></div>
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.orders.amountCoverage)}</p><p>Monto</p></div>
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.orders.currencyCoverage)}</p><p>Moneda</p></div>
          </div>
        </div>

        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Líneas de compra</p>
          </div>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.lines.total.toLocaleString('es-CL')}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.lines.productCoverage)}</p><p>Producto enlazado</p></div>
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.lines.costCoverage)}</p><p>Costo unitario</p></div>
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.lines.receivedCoverage)}</p><p>Recepción</p></div>
            <div><p className="font-medium text-foreground">{isLoading || !data ? '—' : fmt(data.lines.unitCoverage)}</p><p>Unidad de compra</p></div>
          </div>
        </div>
      </div>

      <div className="border-t bg-muted/20 px-4 py-4">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Flujo recepción → factura → pago</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <p className="text-lg font-semibold">{isLoading || !data ? '—' : data.flow.receipts.toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground">Recepciones · {isLoading || !data ? '—' : fmt(data.flow.receiptOrderCoverage)} con OC</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{isLoading || !data ? '—' : data.flow.invoices.toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground">Facturas · {isLoading || !data ? '—' : fmt(data.flow.invoiceOrderCoverage)} con OC</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{isLoading || !data ? '—' : data.flow.payables.toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground">CxP · {isLoading || !data ? '—' : fmt(data.flow.payableInvoiceCoverage)} con factura</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{isLoading || !data ? '—' : data.flow.payments.toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground">Pagos · {isLoading || !data ? '—' : fmt(data.flow.paymentPayableCoverage)} con CxP</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{isLoading || !data ? '—' : data.flow.dtes.toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground">DTE importados</p>
          </div>
        </div>
      </div>

      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        MOTIL no completa proveedores, centros de costo ni unidades por inferencia. Los campos faltantes quedan para conciliación determinística o revisión.
      </div>
    </section>
  );
}
