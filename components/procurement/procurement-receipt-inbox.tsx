'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PendingOrder = {
  purchase_order_id: string;
  order_number: string;
  order_date: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string | null;
  pending_qty: number;
};

type OrderLine = {
  id: number;
  purchase_order_id: string;
  line_number: number;
  product_code: string | null;
  description: string | null;
  quantity: number;
  quantity_received: number | null;
  unit: string | null;
};

type Payload = {
  pending: PendingOrder[];
  lines: OrderLine[];
  summary: { pendingNativeOrders: number; legacyOrdersExcluded: number };
  responsibility: { ownerCargo: string; supervisorCargo: string };
  canReceive: boolean;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar recepciones.');
  return payload;
};

export function ProcurementReceiptInbox() {
  const { data, error, isLoading, mutate } = useSWR<Payload>('/api/procurement/receipt-inbox', fetcher, { revalidateOnFocus: false });
  const order = data?.pending?.[0] || null;
  const orderLines = useMemo(() => (data?.lines || []).filter((line) => line.purchase_order_id === order?.purchase_order_id), [data?.lines, order?.purchase_order_id]);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function receive() {
    if (!order || saving) return;
    const lines = orderLines.map((line) => {
      const received = Number(qty[line.id] || 0);
      return {
        purchase_order_line_id: line.id,
        quantity_received: received,
        quantity_accepted: received,
        quantity_rejected: 0,
      };
    }).filter((line) => line.quantity_received > 0);

    if (!lines.length) {
      setMessage('Ingresa al menos una cantidad recibida.');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/procurement/receipt-inbox', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purchaseOrderId: order.purchase_order_id, lines }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible registrar la recepción.');
      setQty({});
      setMessage('Recepción registrada. La OC se recalculará con evidencia física MOTIL.');
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No fue posible registrar la recepción.');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</section>;
  }

  if (isLoading) {
    return <section className="h-32 animate-pulse rounded-lg bg-muted" />;
  }

  if (!order) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-start gap-2">
          <PackageCheck className="mt-0.5 h-4 w-4" />
          <div>
            <p className="text-sm font-medium">Recepciones operacionales al día</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No hay OCs nativas MOTIL pendientes de recepción. {data?.summary.legacyOrdersExcluded || 0} OCs legacy se conservan como evidencia histórica y no generan recepciones ficticias.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recepción física</p>
        <h2 className="mt-1 text-lg font-semibold">{order.order_number}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {order.supplier_name || 'Proveedor'} · {order.pending_qty} unidad(es) pendientes. Owner: {data?.responsibility.ownerCargo}. Supervisión: {data?.responsibility.supervisorCargo}.
        </p>
      </div>
      <div className="space-y-3 p-4">
        {orderLines.map((line) => {
          const remaining = Math.max(0, Number(line.quantity || 0) - Number(line.quantity_received || 0));
          return (
            <div key={line.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_150px]">
              <div>
                <p className="text-sm font-medium">{line.product_code || 'Sin código'} · {line.description || 'Sin descripción'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Ordenado {line.quantity} · recibido {line.quantity_received || 0} · pendiente {remaining} {line.unit || ''}</p>
              </div>
              <div>
                <Label>Recibir ahora</Label>
                <Input
                  type="number"
                  min="0"
                  max={remaining}
                  value={qty[line.id] || ''}
                  disabled={!data?.canReceive || saving}
                  onChange={(event) => setQty({ ...qty, [line.id]: event.target.value })}
                />
              </div>
            </div>
          );
        })}
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        <div className="flex justify-end">
          <Button onClick={() => void receive()} disabled={!data?.canReceive || saving}>
            <PackageCheck className="mr-2 h-4 w-4" />
            {saving ? 'Registrando…' : 'Confirmar recepción'}
          </Button>
        </div>
      </div>
    </section>
  );
}
