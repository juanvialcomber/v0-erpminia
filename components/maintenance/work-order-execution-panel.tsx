'use client';
import { formatWorkOrderDate } from '@/lib/maintenance/work-order-calendar-date.mjs';

import { useState } from 'react';
import useSWR from 'swr';
import { Clock3, FileText, History, PackageCheck, Printer, RotateCcw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatWorkOrderNumber } from '@/lib/maintenance/work-order-display';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la ejecución');
  return payload;
};

const money = (value: number | string | null | undefined) =>
  `$${Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;

const dateLabel = (value?: string | null) =>
  formatWorkOrderDate(value) || 'Sin fecha';

const durationLabel = (hours?: number | null) => {
  if (hours == null || !Number.isFinite(Number(hours)) || Number(hours) < 0) return 'Sin registrar';
  const minutes = Math.round(Number(hours) * 60);
  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return wholeHours > 0 ? `${wholeHours} h ${String(remainingMinutes).padStart(2, '0')} min` : `${remainingMinutes} min`;
};

type WorkOrderPart = {
  id: string;
  quantity_issued: number;
  quantity_installed: number;
  quantity_returned: number;
  unit_cost: number;
  status: string;
  stock?: { part_code?: string; part_name?: string } | null;
};

type MaintenanceWorker = {
  id: string;
  full_name: string;
  role_title?: string | null;
  profile_id?: string | null;
};

type LaborEntry = {
  id: string;
  technician_id?: string | null;
  technician_name: string;
  hours: number;
  hourly_cost: number;
  notes?: string | null;
};

type ExternalService = {
  id: string;
  provider_name: string;
  service_description: string;
  document_number?: string | null;
  service_date: string;
  amount: number;
  status: string;
  notes?: string | null;
};

type WorkOrderEvent = {
  id: number;
  event_type: string;
  event_at: string;
  summary: string;
  actor_name?: string | null;
};

type WorkOrderSummary = {
  work_order_number?: string;
  title?: string;
  description?: string | null;
  status?: string;
  assigned_to_name?: string | null;
  scheduled_date?: string | null;
  completion_date?: string | null;
  actual_duration_hours?: number | null;
  down_time_hours?: number | null;
  root_cause?: string | null;
  preventive_actions?: string | null;
};

export function WorkOrderExecutionPanel({ workOrderId, readOnly = false }: { workOrderId: string; readOnly?: boolean }) {
  const { data: photoData } = useSWR(workOrderId ? `/api/maintenance/work-orders/${workOrderId}/evidence` : null, fetcher);
  const { data, error, isLoading, mutate } = useSWR(
    workOrderId ? `/api/maintenance/work-orders/${workOrderId}/execution` : null,
    fetcher,
  );
  const [technicianId, setTechnicianId] = useState('');
  const [hours, setHours] = useState('');
  const [hourlyCost, setHourlyCost] = useState('');
  const [laborNotes, setLaborNotes] = useState('');
  const [providerName, setProviderName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceAmount, setServiceAmount] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const workOrder = (data?.workOrder || {}) as WorkOrderSummary;
  const supervisorReview = (data?.supervisorReview || null) as {status:string;reviewed_by_name:string|null;reviewed_at:string|null;decision_note:string|null}|null;
  const parts = (Array.isArray(data?.parts) ? data.parts : []) as WorkOrderPart[];
  const labor = (Array.isArray(data?.labor) ? data.labor : []) as LaborEntry[];
  const materialRequirements = (Array.isArray(data?.materialRequirements) ? data.materialRequirements : []) as Array<{ id: string; canonical_product_id?: string | null; quantity_required: number; status: string; notes?: string | null; product?: { name?: string | null; product_code?: string | null; unit?: string | null } | null }>;
  const workers = (Array.isArray(data?.workers) ? data.workers : []) as MaintenanceWorker[];
  const selectedWorker = workers.find((worker) => worker.id === technicianId);
  const services = (Array.isArray(data?.externalServices) ? data.externalServices : []) as ExternalService[];
  const events = (Array.isArray(data?.events) ? data.events : []) as WorkOrderEvent[];
  const costs = data?.costs || {};
  const reportPhotos = (Array.isArray(photoData?.evidence) ? photoData.evidence : []).filter((photo: { signed_url?: string | null }) => Boolean(photo.signed_url)) as Array<{ id: string; signed_url: string; file_name?: string | null }>;

  const printReport = async () => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('#work-order-final-report img'));
    await Promise.all(images.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      try { await img.decode(); } catch { /* Allow printing with accessible evidence even if one image fails. */ }
    }));
    const previousTitle = document.title;
    const clean = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);
    const date = (workOrder.completion_date || workOrder.scheduled_date || new Date().toISOString()).slice(0, 10).replace(/-/g, '');
    const order = clean(workOrder.work_order_number || workOrderId);
    const name = clean(workOrder.title || 'Orden_de_Trabajo');
    document.title = `${date}_${order}_${name}`;
    window.print();
    // Printing is asynchronous; restore the application title after closing the print dialog.
    window.addEventListener('afterprint', () => { document.title = previousTitle; }, { once: true });
  };

  const execute = async (payload: Record<string, unknown>, key: string) => {
    setBusyKey(key);
    setMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo registrar la operación');
      await mutate();
      return true;
    } catch (executionError) {
      setMessage(executionError instanceof Error ? executionError.message : 'No se pudo registrar la operación');
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const addLabor = async () => {
    const saved = await execute(
      {
        action: 'add_labor',
        technicianId,
        technicianName: selectedWorker?.full_name || '',
        hours: Number(hours),
        hourlyCost: Number(hourlyCost || 0),
        notes: laborNotes || null,
      },
      'labor',
    );
    if (saved) {
      setTechnicianId('');
      setHours('');
      setHourlyCost('');
      setLaborNotes('');
    }
  };

  const addExternalService = async () => {
    const saved = await execute(
      {
        action: 'add_external_service',
        providerName,
        serviceDescription,
        documentNumber: documentNumber || null,
        serviceDate,
        amount: Number(serviceAmount),
        serviceStatus: 'approved',
        notes: serviceNotes || null,
      },
      'service',
    );
    if (saved) {
      setProviderName('');
      setServiceDescription('');
      setDocumentNumber('');
      setServiceAmount('');
      setServiceNotes('');
    }
  };

  return (
    <div className="space-y-6">
      <style>{`@media print {
        @page { size: A4; margin: 15mm; }
        body * { visibility: hidden !important; }
        #work-order-final-report, #work-order-final-report * { visibility: visible !important; }
        #work-order-final-report { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; border: none !important; box-shadow: none !important; background: white !important; color: black !important; }
        #work-order-final-report button { display: none !important; }
        #work-order-final-report img { object-fit: contain !important; }
        #work-order-final-report { font-family: Arial, sans-serif !important; font-size: 10pt !important; }
        #work-order-final-report .ot-print-header { display: flex !important; border-bottom: 3px solid #CE814C !important; padding-bottom: 14px !important; }
        #work-order-final-report .ot-print-header img { max-height: 58px !important; }
        #work-order-final-report .ot-print-registry { background: #F4EEE7 !important; border: 2px solid #CE814C !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        #work-order-final-report .ot-print-primary img { height: 250px !important; width: 100% !important; }
        #work-order-final-report .ot-print-thumbs img { height: 125px !important; width: 100% !important; }
        #work-order-final-report .ot-print-photo { break-inside: avoid !important; page-break-inside: avoid !important; }
        #work-order-final-report section { break-inside: avoid; }
        #work-order-final-report .ot-print-title { color: #293B38 !important; }
      }`}</style>
      <Card className="shadow-none print:shadow-none" id="work-order-final-report">
        <div className="ot-print-header hidden items-center justify-between gap-8 px-6 pt-5 print:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/la-patagua-official.svg" alt="La Patagua" className="h-14 w-auto max-w-[45%] object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/motil-wordmark.png" alt="MOTIL" className="h-10 w-auto max-w-[30%] object-contain" />
        </div>
        <div className="hidden px-6 pt-4 print:block">
          <h1 className="ot-print-title text-2xl font-bold">Informe final de orden de trabajo</h1>
          <p className="text-sm">La Patagua · MOTIL · Registro de mantenimiento</p>
        </div>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Informe final de la orden</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void printReport()} className="print:hidden"><Printer className="mr-2 h-4 w-4" />Imprimir / Guardar PDF</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/30 px-5 py-6 sm:px-7">
            <p className="text-sm font-medium text-muted-foreground">Tiempo total ejecutado</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{durationLabel(workOrder.actual_duration_hours)}</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span>Tiempo detenido: <strong className="font-medium text-foreground">{durationLabel(workOrder.down_time_hours)}</strong></span>
              <span>Responsable: <strong className="font-medium text-foreground">{workOrder.assigned_to_name || 'Sin asignar'}</strong></span>
              <span>Estado: <strong className="font-medium text-foreground">{workOrder.status === 'completed' ? 'Cerrada' : 'En proceso'}</strong></span>
            </div>
          </div>
          <div className="ot-print-registry grid gap-4 rounded-lg p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs font-semibold text-muted-foreground">Registro / Orden</p><p className="mt-1 font-medium">{workOrder.work_order_number ? formatWorkOrderNumber(workOrder.work_order_number, 'es') : 'Sin número'}</p></div>
            <div><p className="text-xs text-muted-foreground">Responsable</p><p className="mt-1 font-medium">{workOrder.assigned_to_name || 'Sin asignar'}</p></div>
            <div><p className="text-xs text-muted-foreground">Fecha programada</p><p className="mt-1 font-medium">{dateLabel(workOrder.scheduled_date)}</p></div>
            <div><p className="text-xs text-muted-foreground">Fecha de cierre</p><p className="mt-1 font-medium">{dateLabel(workOrder.completion_date)}</p></div>
          </div>
          <div><p className="text-xs text-muted-foreground">Trabajo solicitado</p><p className="mt-1 text-sm">{workOrder.title || 'Sin título'}{workOrder.description ? ` · ${workOrder.description}` : ''}</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">Causa principal</p><p className="mt-1 text-sm">{workOrder.root_cause || 'No registrada'}</p></div>
            <div><p className="text-xs text-muted-foreground">Acción aplicada</p><p className="mt-1 text-sm">{workOrder.preventive_actions || 'No registrada'}</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Personal asignado</p><p className="mt-1 font-medium">{workOrder.assigned_to_name || 'Sin asignar'}</p><p className="text-xs text-muted-foreground">{labor.length ? `${labor.length} registro(s) de mano de obra` : 'Horas de mano de obra sin registrar'}</p></div>
            <div><p className="text-xs text-muted-foreground">Costo registrado</p><p className="mt-1 font-medium">{Number(costs.total_cost || 0) > 0 ? money(costs.total_cost) : 'Pendiente de valorización'}</p></div>
          </div>
          <section className="rounded-lg border-2 border-[#CE814C] bg-[#F4EEE7] p-4 text-[#293B38] print:break-inside-avoid" aria-label="Validación de supervisor">
            <h2 className="text-sm font-bold uppercase tracking-wide">Validación de supervisor</h2>
            {supervisorReview?.status === 'approved' ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="text-lg font-bold">APROBADA</p>
                <p>Aprobado por: <strong>{supervisorReview.reviewed_by_name || 'Identidad no disponible'}</strong></p>
                <p>Fecha de aprobación: {supervisorReview.reviewed_at ? new Date(supervisorReview.reviewed_at).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'long',timeStyle:'short'}) : 'Sin fecha registrada'}</p>
                {supervisorReview.decision_note ? <p>Observación: {supervisorReview.decision_note}</p> : null}
              </div>
            ) : <p className="mt-2 text-sm font-semibold">{supervisorReview?.status === 'rejected' ? 'Revisión rechazada' : 'Sin aprobación de supervisor registrada'}</p>}
          </section>
          {reportPhotos.length > 0 ? (
            <section className="hidden print:block">
              <p className="mb-2 text-sm font-semibold">Evidencia fotográfica ({reportPhotos.length})</p>
              <div className="ot-print-primary grid grid-cols-2 gap-3">
                {reportPhotos.slice(0, 2).map((photo) => (
                  <div key={photo.id} className="ot-print-photo rounded border p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.signed_url} alt={photo.file_name || 'Evidencia de OT'} className="w-full object-contain" />
                  </div>
                ))}
              </div>
              {reportPhotos.length > 2 ? (
                <div className="ot-print-thumbs mt-3 grid grid-cols-3 gap-3">
                  {reportPhotos.slice(2).map((photo) => (
                    <div key={photo.id} className="ot-print-photo rounded border p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.signed_url} alt={photo.file_name || 'Evidencia adicional de OT'} className="w-full object-contain" />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="grid gap-5 lg:grid-cols-2">
            <div><p className="text-sm font-medium">Materiales y repuestos vinculados</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {parts.map(part=><li key={part.id}>{part.stock?.part_name || part.stock?.part_code || 'Material sin nombre'} · solicitados {part.quantity_issued || 0} entregados / {part.quantity_installed || 0} instalados · {part.status}</li>)}
              {materialRequirements.map(item=><li key={item.id}>Requerimiento {item.product?.name || item.product?.product_code || item.notes || 'material no identificado'} · cantidad {item.quantity_required} · {item.status} (pendiente de conciliación)</li>)}
              {!parts.length && !materialRequirements.length?<li>No hay materiales registrados en la OT; las fotografías no constituyen un movimiento de bodega.</li>:null}
            </ul></div>
            
            <div><p className="text-sm font-medium">Servicios externos</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{services.map((service) => <li key={service.id}>{service.provider_name} · {money(service.amount)}</li>)}{services.length === 0 ? <li>Sin servicios externos</li> : null}</ul></div>
          </div>
        </CardContent>
      </Card>

      {!readOnly ? (
        <>
      <Card className="shadow-none">
        <CardHeader><CardTitle className="text-base">Costo real de la orden</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Repuestos instalados', costs.parts_cost],
            ['Mano de obra', costs.labor_cost],
            ['Servicios externos', costs.external_cost],
            ['Costo total', costs.total_cost],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="mt-1 text-xl font-semibold">{money(value as number)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="h-4 w-4" />Destino de repuestos entregados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : parts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Aún no hay repuestos entregados desde bodega.</p>
          ) : parts.map((part) => {
            const pending = Number(part.quantity_issued || 0) - Number(part.quantity_installed || 0) - Number(part.quantity_returned || 0);
            return (
              <div key={part.id} className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium">{part.stock?.part_name || 'Repuesto'}</p>
                  <p className="text-sm text-muted-foreground">{part.stock?.part_code || 'Sin código'} · {money(part.unit_cost)} por unidad</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">Entregados {part.quantity_issued || 0}</Badge>
                    <Badge variant="outline">Instalados {part.quantity_installed || 0}</Badge>
                    <Badge variant="outline">Devueltos {part.quantity_returned || 0}</Badge>
                    <Badge variant={pending > 0 ? 'secondary' : 'outline'}>Pendientes {pending}</Badge>
                  </div>
                </div>
                {pending > 0 ? <div className="flex gap-2">
                  <Button size="sm" disabled={busyKey === part.id} onClick={() => execute({ action: 'install_part', workOrderPartId: part.id, quantity: pending }, part.id)}>
                    <Wrench className="mr-2 h-4 w-4" />Instalar
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyKey === part.id} onClick={() => execute({ action: 'return_part', workOrderPartId: part.id, quantity: pending }, part.id)}>
                    <RotateCcw className="mr-2 h-4 w-4" />Devolver
                  </Button>
                </div> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4" />Mano de obra</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div><Label htmlFor="labor-technician">Persona</Label><select id="labor-technician" className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}><option value="">Seleccionar persona</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name}{worker.role_title ? ` · ${worker.role_title}` : ''}</option>)}</select></div>
            <div><Label htmlFor="labor-hours">Horas</Label><Input id="labor-hours" className="mt-2" type="number" min="0.1" step="0.1" value={hours} onChange={(event) => setHours(event.target.value)} /></div>
            <div><Label htmlFor="labor-cost">Costo por hora</Label><Input id="labor-cost" className="mt-2" type="number" min="0" value={hourlyCost} onChange={(event) => setHourlyCost(event.target.value)} /></div>
            <div className="flex items-end"><Button className="w-full" onClick={addLabor} disabled={busyKey === 'labor' || !technicianId || Number(hours) <= 0}>Registrar</Button></div>
          </div>
          <div><Label htmlFor="labor-notes">Trabajo realizado</Label><Input id="labor-notes" className="mt-2" value={laborNotes} onChange={(event) => setLaborNotes(event.target.value)} placeholder="Actividad, especialidad u observación" /></div>
          {labor.length > 0 ? <div className="divide-y rounded-lg border">{labor.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 p-3 text-sm">
              <div><p className="font-medium">{entry.technician_name}</p><p className="text-muted-foreground">{entry.notes || 'Sin observación'}</p></div>
              <div className="text-right"><p>{entry.hours} h</p><p className="text-muted-foreground">{money(Number(entry.hours) * Number(entry.hourly_cost))}</p></div>
            </div>
          ))}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aún no hay mano de obra registrada.</p>}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Servicios externos</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div><Label htmlFor="service-provider">Proveedor</Label><Input id="service-provider" className="mt-2" value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Empresa o profesional" /></div>
            <div><Label htmlFor="service-description">Servicio realizado</Label><Input id="service-description" className="mt-2" value={serviceDescription} onChange={(event) => setServiceDescription(event.target.value)} placeholder="Descripción breve" /></div>
            <div><Label htmlFor="service-document">Documento</Label><Input id="service-document" className="mt-2" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} placeholder="Factura, guía u orden" /></div>
            <div><Label htmlFor="service-date">Fecha</Label><Input id="service-date" className="mt-2" type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></div>
            <div><Label htmlFor="service-amount">Monto</Label><Input id="service-amount" className="mt-2" type="number" min="0" value={serviceAmount} onChange={(event) => setServiceAmount(event.target.value)} /></div>
            <div className="flex items-end"><Button className="w-full" onClick={addExternalService} disabled={busyKey === 'service' || !providerName.trim() || !serviceDescription.trim() || Number(serviceAmount) < 0 || serviceAmount === ''}>Registrar servicio</Button></div>
          </div>
          <div><Label htmlFor="service-notes">Observaciones</Label><Textarea id="service-notes" className="mt-2" rows={2} value={serviceNotes} onChange={(event) => setServiceNotes(event.target.value)} placeholder="Alcance, garantía o condición relevante" /></div>
          {services.length > 0 ? <div className="divide-y rounded-lg border">{services.map((service) => (
            <div key={service.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{service.provider_name} · {service.service_description}</p><p className="text-muted-foreground">{dateLabel(service.service_date)}{service.document_number ? ` · ${service.document_number}` : ''}{service.notes ? ` · ${service.notes}` : ''}</p></div>
              <div className="flex items-center gap-3"><Badge variant="outline">{service.status === 'pending' ? 'Pendiente' : 'Aprobado'}</Badge><p className="font-medium">{money(service.amount)}</p></div>
            </div>
          ))}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No hay servicios externos registrados.</p>}
        </CardContent>
      </Card>

        </>
      ) : null}

      <Card className="shadow-none print:hidden">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Historial de la orden</CardTitle></CardHeader>
        <CardContent>
          {events.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">El historial se completará con cada acción operativa.</p> : (
            <div className="space-y-0">{events.map((event, index) => (
              <div key={event.id} className="relative flex gap-4 pb-5">
                {index < events.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-border" /> : null}
                <span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-background bg-primary" />
                <div><p className="text-sm font-medium">{event.summary || event.event_type}</p><p className="text-xs text-muted-foreground">{new Date(event.event_at).toLocaleString('es-CL')}{event.actor_name ? ` · ${event.actor_name}` : ''}</p></div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>

      {error || message ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message || (error instanceof Error ? error.message : 'No se pudo cargar la ejecución')}</div> : null}
    </div>
  );
}
