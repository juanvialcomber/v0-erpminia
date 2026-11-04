'use client';

import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la información.');
  return payload;
};

type Product = {
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  unit: string | null;
  quantity_available: number | string | null;
  unit_cost: number | string | null;
  warehouse_code: string | null;
};

type Usage = {
  id: string;
  fluid_name: string;
  quantity_liters: number | string;
  total_cost: number | string | null;
  cost_state: 'source' | 'derived' | 'unavailable';
  warehouse_code: string | null;
  used_at: string;
  linked_waste?: {
    id: string;
    waste_name: string;
    quantity: number | string;
    unit: string;
    status: 'generated' | 'stored' | 'removed' | 'closed';
  } | null;
};

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n) : 'N/D';
}

export function WorkOrderFluidUsagePanel({ workOrderId, readOnly = false }: { workOrderId: string; readOnly?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(workOrderId ? '/api/maintenance/work-orders/' + workOrderId + '/fluids' : null, fetcher, { revalidateOnFocus: false });
  const { data: productData } = useSWR('/api/maintenance/lubrication/products', fetcher, { revalidateOnFocus: false });
  const rows = (data?.rows || []) as Usage[];
  const products = (productData?.rows || []) as Product[];
  const canEdit = Boolean(data?.canEdit) && !readOnly;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productKey = String(form.get('product') || '');
    const [productId, warehouseCode] = productKey.split('|');
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/maintenance/work-orders/' + workOrderId + '/fluids', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_product_id: productId || null,
          warehouse_code: warehouseCode || null,
          fluid_name: form.get('fluid_name') || null,
          quantity_liters: Number(form.get('quantity_liters')),
          inventory_units_used: form.get('inventory_units_used') ? Number(form.get('inventory_units_used')) : null,
          recovered_waste_liters: form.get('recovered_waste_liters') ? Number(form.get('recovered_waste_liters')) : null,
          linked_waste_code: form.get('linked_waste_code') || null,
          waste_storage_location: form.get('waste_storage_location') || null,
          notes: form.get('notes') || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar el fluido.');
      event.currentTarget.reset();
      setOpen(false);
      setMessage(payload?.linkedWasteCreated
        ? 'Uso de fluido y residuo vinculado registrados. Bodega no fue modificada.'
        : 'Uso de fluido registrado. Bodega no fue modificada.');
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo registrar el fluido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Lubricación</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Registra litros utilizados en esta OT. El stock de Bodega se mantiene como fuente canónica separada.</p>
        </div>
        {canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>Registrar</Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {open && canEdit ? (
          <form onSubmit={submit} className="grid gap-4 rounded-lg border p-4">
            <div className="space-y-2">
              <Label htmlFor="fluid-product">Lubricante de Bodega</Label>
              <select id="fluid-product" name="product" defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Otro / sin vínculo a Bodega</option>
                {products.map((product) => (
                  <option key={(product.product_id || '') + '|' + (product.warehouse_code || '')} value={(product.product_id || '') + '|' + (product.warehouse_code || '')}>
                    {product.product_code ? product.product_code + ' · ' : ''}{product.product_name || 'Lubricante'} · {product.warehouse_code || 'Bodega'} · {Number(product.quantity_available || 0).toLocaleString('es-CL')} {product.unit || ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="fluid-name">Nombre manual</Label><Input id="fluid-name" name="fluid_name" placeholder="Sólo si no está en Bodega" /></div>
              <div className="space-y-2"><Label htmlFor="fluid-liters">Litros usados</Label><Input id="fluid-liters" name="quantity_liters" type="number" min="0.001" step="0.001" required /></div>
              <div className="space-y-2"><Label htmlFor="fluid-units">Unidades Bodega</Label><Input id="fluid-units" name="inventory_units_used" type="number" min="0.001" step="0.001" placeholder="Opcional" /></div>
            </div>
            <div className="grid gap-4 rounded-md border border-dashed p-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fluid-waste-liters">Residuo recuperado (L)</Label>
                <Input id="fluid-waste-liters" name="recovered_waste_liters" type="number" min="0.001" step="0.001" placeholder="Opcional" />
                <p className="text-[11px] text-muted-foreground">No se infiere desde los litros cargados; registra sólo lo realmente recuperado.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fluid-waste-type">Tipo de residuo</Label>
                <select id="fluid-waste-type" name="linked_waste_code" defaultValue="used_oil" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="used_oil">Aceite usado</option>
                  <option value="hydraulic_fluid">Fluido hidráulico usado</option>
                  <option value="coolant">Refrigerante usado</option>
                  <option value="brake_fluid">Líquido de frenos usado</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fluid-waste-location">Ubicación inicial</Label>
                <Input id="fluid-waste-location" name="waste_storage_location" placeholder="Ej. Tambor / taller" />
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="fluid-notes">Nota</Label><Input id="fluid-notes" name="notes" /></div>
            <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>
          </form>
        ) : null}

        {message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando uso de fluidos…</p> : null}
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        {!isLoading && !error && rows.length === 0 ? <p className="text-sm text-muted-foreground">Esta OT aún no tiene fluidos registrados.</p> : null}

        {rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
            <div>
              <p className="font-medium">{row.fluid_name}</p>
              <p className="text-xs text-muted-foreground">{row.warehouse_code || 'Sin Bodega vinculada'}</p>
              {row.linked_waste ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Residuo vinculado: {row.linked_waste.waste_name} · {Number(row.linked_waste.quantity).toLocaleString('es-CL')} {row.linked_waste.unit} · {row.linked_waste.status}
                </p>
              ) : null}
            </div>
            <p className="text-sm tabular-nums">{Number(row.quantity_liters).toLocaleString('es-CL')} L</p>
            <div className="flex flex-wrap justify-end gap-2">
              {row.linked_waste ? <Badge variant="secondary">Residuo vinculado</Badge> : null}
              <Badge variant="outline">{row.cost_state === 'unavailable' ? 'Costo N/D' : money(row.total_cost)}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
