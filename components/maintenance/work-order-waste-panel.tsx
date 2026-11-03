'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar residuos');
  return payload;
};

const wasteOptions = [
  ['used_oil','Aceite usado'],
  ['hydraulic_fluid','Fluido hidráulico usado'],
  ['coolant','Refrigerante / anticongelante'],
  ['brake_fluid','Líquido de frenos'],
  ['contaminated_fuel','Combustible contaminado'],
  ['used_filter','Filtro usado'],
  ['contaminated_absorbent','Absorbente / paño contaminado'],
  ['battery','Batería'],
  ['tire','Neumático'],
  ['contaminated_container','Envase contaminado'],
  ['scrap_metal','Chatarra / repuesto metálico'],
  ['common_waste','Residuo común'],
  ['other','Otro'],
] as const;

type WasteRow = {
  id: string;
  waste_code: string;
  waste_name: string;
  classification: 'hazardous' | 'non_hazardous' | 'to_classify';
  quantity: number;
  unit: 'L' | 'kg' | 'unit';
  container_code: string | null;
  storage_location: string | null;
  status: 'generated' | 'stored' | 'removed' | 'closed';
  generated_at: string;
  transporter_name: string | null;
  destination_name: string | null;
  transfer_document_ref: string | null;
  notes: string | null;
};

function classificationLabel(value: WasteRow['classification']) {
  if (value === 'hazardous') return 'Peligroso';
  if (value === 'non_hazardous') return 'No peligroso';
  return 'Por clasificar';
}

function statusLabel(value: WasteRow['status']) {
  if (value === 'generated') return 'Generado';
  if (value === 'stored') return 'Almacenado';
  if (value === 'removed') return 'Retirado';
  return 'Cerrado';
}

export function WorkOrderWastePanel({ workOrderId, readOnly = false }: { workOrderId: string; readOnly?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(
    workOrderId ? '/api/maintenance/work-orders/' + workOrderId + '/waste' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const rows = (data?.data || []) as WasteRow[];
  const canEdit = Boolean(data?.canEdit) && !readOnly;
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const openCount = useMemo(() => rows.filter((row) => row.status !== 'closed').length, [rows]);

  async function createWaste(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get('waste_code') || '');
    const label = wasteOptions.find(([value]) => value === code)?.[1] || 'Otro';
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/maintenance/work-orders/' + workOrderId + '/waste', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waste_code: code,
          waste_name: label,
          classification: form.get('classification'),
          quantity: Number(form.get('quantity')),
          unit: form.get('unit'),
          container_code: form.get('container_code') || null,
          storage_location: form.get('storage_location') || null,
          notes: form.get('notes') || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar el residuo.');
      event.currentTarget.reset();
      setFormOpen(false);
      setMessage('Residuo registrado.');
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo registrar el residuo.');
    } finally {
      setSaving(false);
    }
  }

  async function advance(row: WasteRow, nextStatus: WasteRow['status']) {
    const storageLocation = nextStatus !== 'generated' && !row.storage_location
      ? window.prompt('Ubicación de almacenamiento')
      : row.storage_location;
    if (nextStatus !== 'generated' && !storageLocation) return;
    const destinationName = (nextStatus === 'removed' || nextStatus === 'closed') && !row.destination_name
      ? window.prompt('Destino del residuo')
      : row.destination_name;
    if ((nextStatus === 'removed' || nextStatus === 'closed') && !destinationName) return;

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/maintenance/work-orders/' + workOrderId + '/waste', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waste_id: row.id,
          status: nextStatus,
          storage_location: storageLocation,
          destination_name: destinationName,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo actualizar el residuo.');
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo actualizar el residuo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Residuos</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Trazabilidad operacional del residuo generado por esta OT. No certifica cumplimiento regulatorio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 ? <Badge variant="outline">{openCount} pendiente{openCount === 1 ? '' : 's'}</Badge> : null}
          {canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen((value) => !value)}>Registrar</Button> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {formOpen && canEdit ? (
          <form onSubmit={createWaste} className="grid gap-4 rounded-lg border p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="waste-code">Residuo</Label>
                <select id="waste-code" name="waste_code" defaultValue="used_oil" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {wasteOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="waste-classification">Clasificación</Label>
                <select id="waste-classification" name="classification" defaultValue="to_classify" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="to_classify">Por clasificar</option>
                  <option value="hazardous">Peligroso</option>
                  <option value="non_hazardous">No peligroso</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="waste-quantity">Cantidad</Label>
                <Input id="waste-quantity" name="quantity" type="number" min="0.001" step="0.001" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="waste-unit">Unidad</Label>
                <select id="waste-unit" name="unit" defaultValue="L" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="L">L</option>
                  <option value="kg">kg</option>
                  <option value="unit">unidad</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="waste-container">Contenedor</Label><Input id="waste-container" name="container_code" placeholder="Ej. Tambor AU-017" /></div>
              <div className="space-y-2"><Label htmlFor="waste-location">Ubicación</Label><Input id="waste-location" name="storage_location" placeholder="Ej. Taller Don Jaime" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="waste-notes">Nota</Label><Textarea id="waste-notes" name="notes" rows={2} /></div>
            <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar residuo'}</Button><Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button></div>
          </form>
        ) : null}

        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando residuos…</p> : null}
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        {!isLoading && !error && rows.length === 0 ? <p className="text-sm text-muted-foreground">Esta OT no tiene residuos registrados.</p> : null}

        <div className="space-y-2">
          {rows.map((row) => {
            const next = row.status === 'generated' ? 'stored' : row.status === 'stored' ? 'removed' : row.status === 'removed' ? 'closed' : null;
            return (
              <div key={row.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto] sm:items-center">
                <div>
                  <p className="font-medium">{row.waste_name}</p>
                  <p className="text-xs text-muted-foreground">{classificationLabel(row.classification)}{row.storage_location ? ' · ' + row.storage_location : ''}</p>
                </div>
                <p className="text-sm tabular-nums">{Number(row.quantity).toLocaleString('es-CL')} {row.unit === 'unit' ? 'un' : row.unit}</p>
                <Badge variant={row.status === 'closed' ? 'secondary' : 'outline'}>{statusLabel(row.status)}</Badge>
                {canEdit && next ? <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void advance(row, next)}>{statusLabel(next)}</Button> : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
