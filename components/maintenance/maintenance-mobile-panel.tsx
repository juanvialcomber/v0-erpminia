'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertCircle, ArrowRight, Gauge, QrCode, Smartphone, Upload, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { inferMachineFamilyFromText } from '@/lib/maintenance/cost-center-machines';
import { formatWorkOrderDate } from '@/lib/maintenance/work-order-calendar-date.mjs';
import type { DerivedCostCenterMachine } from '@/lib/maintenance/cost-center-machines';

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((res) => res.json());

type AssetRow = {
  id: string;
  asset_name: string | null;
  asset_code: string | null;
  asset_type: string | null;
  location: string | null;
  model: string | null;
  manufacturer: string | null;
  mtbf_hours: number | string | null;
};

type WorkOrderRow = {
  id: string;
  status: string | null;
  priority: string | null;
  work_order_number: string | null;
  code: string | null;
  title: string | null;
  asset_name: string | null;
  scheduled_date: string | null;
};

type SelectedHistoryRow = {
  id: string;
  created_at: string | null;
  notes: string | null;
  parts_replaced: string | null;
  work_order?: {
    work_order_number: string | null;
  } | null;
};

type TimeEntryRow = {
  id: string;
  horas_trabajadas: number | string | null;
  descripcion: string | null;
  fecha: string | null;
};

type EvidenceRow = {
  id: string;
  file_name: string | null;
  file_type: string | null;
};

type TechnicianRow = {
  technicianId: string;
  name: string | null;
  hours: number | string | null;
  entries: number | string | null;
};

type PersonalSummary = {
  totalHours: number;
  totalEntries: number;
  technicians: number;
};

type AssetHistoryResponse = {
  asset?: AssetRow | null;
  history?: SelectedHistoryRow[];
};

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: 'Abierta',
    abierta: 'Abierta',
    pending: 'Pendiente',
    pendiente: 'Pendiente',
    assigned: 'Asignada',
    asignada: 'Asignada',
    in_progress: 'En progreso',
    en_progreso: 'En progreso',
    completed: 'Completada',
    completada: 'Completada',
    closed: 'Cerrada',
    cerrada: 'Cerrada',
  };
  return labels[normalizeText(status)] || status || 'Sin estado';
}

function resolveAssetScope(assetType?: string | null, model?: string | null, manufacturer?: string | null) {
  const text = `${assetType || ''} ${model || ''} ${manufacturer || ''}`;
  const vehicleHints = ['vehiculo', 'vehiculos', 'camioneta', 'camion', 'bus', 'furgon', 'pickup', 'tractor'];
  return vehicleHints.some((hint) => normalizeText(text).includes(hint)) ? 'vehiculos' : 'equipos';
}

export function MaintenanceMobilePanel() {
  const searchParams = useSearchParams();
  const assetId = searchParams.get('assetId') || '';

  const { data: assetsData } = useSWR('/api/maintenance/assets', fetcher);
  const { data: machineCatalogData } = useSWR('/api/maintenance/cost-center-machines', fetcher);
  const { data: ordersData } = useSWR('/api/maintenance/work-orders', fetcher);
  const { data: mttrData } = useSWR('/api/maintenance/mttr', fetcher);
  const { data: assetHistoryData } = useSWR(assetId ? `/api/maintenance/assets/${assetId}/history` : null, fetcher);
  const { data: personalData, mutate: mutatePersonal } = useSWR('/api/maintenance/personal', fetcher);

  const assets = (Array.isArray(assetsData?.assets) ? assetsData.assets : []) as AssetRow[];
  const machineCatalog = (Array.isArray(machineCatalogData?.machines) ? machineCatalogData.machines : []) as DerivedCostCenterMachine[];
  const workOrders = (Array.isArray(ordersData?.workOrders) ? ordersData.workOrders : []) as WorkOrderRow[];
  const selectedAsset = (assetHistoryData as AssetHistoryResponse | undefined)?.asset || null;
  const selectedHistory = ((assetHistoryData as AssetHistoryResponse | undefined)?.history || []) as SelectedHistoryRow[];

  const openOrders = useMemo(
    () =>
      workOrders
        .filter((order) =>
          ['open', 'pending', 'pendiente', 'in_progress', 'en_progreso', 'assigned', 'asignada'].includes(
            normalizeText(order.status || ''),
          ),
        )
        .slice(0, 8),
    [workOrders],
  );

  const urgentOrders = useMemo(
    () =>
      workOrders
        .filter((order) => ['high', 'critical', 'urgente', 'alta', 'critica'].includes(normalizeText(order.priority || '')))
        .slice(0, 3),
    [workOrders],
  );

  const [selectedOtId, setSelectedOtId] = useState('');
  const [hoursWorked, setHoursWorked] = useState('1');
  const [timeNotes, setTimeNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [registeringTime, setRegisteringTime] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const currentOrder = workOrders.find((order) => order.id === selectedOtId) || openOrders[0] || workOrders[0] || null;

  useEffect(() => {
    if (!selectedOtId && currentOrder?.id) {
      setSelectedOtId(currentOrder.id);
    }
  }, [currentOrder, selectedOtId]);

  const { data: selectedTimeData, mutate: mutateSelectedTime } = useSWR(
    selectedOtId ? `/api/mantenimiento/tiempo?otId=${encodeURIComponent(selectedOtId)}` : null,
    fetcher,
  );
  const { data: selectedEvidenceData, mutate: mutateSelectedEvidence } = useSWR(
    selectedOtId ? `/api/mantenimiento/evidencia?otId=${encodeURIComponent(selectedOtId)}` : null,
    fetcher,
  );

  const personalSummary: PersonalSummary = personalData?.summary || { totalHours: 0, totalEntries: 0, technicians: 0 };
  const technicians = (Array.isArray(personalData?.technicians) ? personalData.technicians : []) as TechnicianRow[];
  const recentEntries = (Array.isArray(personalData?.recentEntries) ? personalData.recentEntries : []) as TimeEntryRow[];
  const timeEntries = (Array.isArray(selectedTimeData?.time_entries) ? selectedTimeData.time_entries : []) as TimeEntryRow[];
  const evidenceEntries = (Array.isArray(selectedEvidenceData?.evidence) ? selectedEvidenceData.evidence : []) as EvidenceRow[];

  const selectedAssetFamily = useMemo(() => {
    const text = `${selectedAsset?.asset_name || ''} ${selectedAsset?.asset_type || ''} ${selectedAsset?.model || ''} ${selectedAsset?.manufacturer || ''}`;
    return inferMachineFamilyFromText(text) || 'Sin familia';
  }, [selectedAsset?.asset_name, selectedAsset?.asset_type, selectedAsset?.model, selectedAsset?.manufacturer]);
  const selectedAssetScope = resolveAssetScope(selectedAsset?.asset_type, selectedAsset?.model, selectedAsset?.manufacturer);

  const stats = [
    { label: 'Equipos', value: String(machineCatalog.length || assets.length), icon: Smartphone },
    { label: 'OT abiertas', value: String(openOrders.length), icon: Wrench },
    { label: 'Urgentes', value: String(urgentOrders.length), icon: AlertCircle },
    { label: 'MTTR', value: `${Number(mttrData?.averageMTTR || 0).toFixed(1)} h`, icon: Gauge },
  ];

  const handleRegisterTime = async () => {
    if (!selectedOtId) {
      toast.error('Selecciona una orden de trabajo');
      return;
    }

    const parsedHours = Number(hoursWorked);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      toast.error('Ingresa horas validas');
      return;
    }

    setRegisteringTime(true);
    try {
      const response = await fetch('/api/mantenimiento/tiempo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          otId: selectedOtId,
          horasTrabajadas: parsedHours,
          descripcion: timeNotes,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar el tiempo');

      toast.success('Tiempo registrado correctamente');
      setTimeNotes('');
      await mutateSelectedTime();
      await mutatePersonal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el tiempo');
    } finally {
      setRegisteringTime(false);
    }
  };

  const handleUploadEvidence = async () => {
    if (!selectedOtId) {
      toast.error('Selecciona una orden de trabajo');
      return;
    }

    if (!evidenceFile) {
      toast.error('Selecciona una evidencia para subir');
      return;
    }

    setUploadingEvidence(true);
    try {
      const response = await fetch('/api/mantenimiento/evidencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          otId: selectedOtId,
          fileName: evidenceLabel.trim() || evidenceFile.name,
          fileType: evidenceFile.type || 'application/octet-stream',
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo preparar la evidencia');

      if (payload?.signed_url) {
        const uploadResponse = await fetch(payload.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': evidenceFile.type || 'application/octet-stream' },
          body: evidenceFile,
        });

        if (!uploadResponse.ok) {
          throw new Error('No se pudo subir el archivo a almacenamiento');
        }
      }

      toast.success('Evidencia subida correctamente');
      setEvidenceFile(null);
      setEvidenceLabel('');
      await mutateSelectedEvidence();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la evidencia');
    } finally {
      setUploadingEvidence(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operación en terreno de mantenimiento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vista para terreno con OT reales, horas, evidencia y acceso rápido a la ficha del equipo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
              <stat.icon className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acceso rápido</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2">
          <Button asChild variant="outline" className="w-full justify-between">
            <Link href={`/dashboard/mantenimiento/${selectedAssetScope}`}>
              {selectedAssetScope === 'vehiculos' ? 'Vehículos y traslados' : 'Equipos'}
              <QrCode className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-between">
            <Link href="/dashboard/mantenimiento/bitacora">
              Bitácora
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-between">
            <Link href="/dashboard/mantenimiento/gerencial">
              Dashboard gerencial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumen de terreno</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Personal</p>
            <p className="text-xl font-bold">{personalSummary.technicians || 0}</p>
            <p className="text-xs text-muted-foreground">Técnicos con registros</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Horas</p>
            <p className="text-xl font-bold">{Number(personalSummary.totalHours || 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Horas cargadas hoy</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Urgentes</p>
            <p className="text-xl font-bold text-orange-500">{urgentOrders.length}</p>
            <p className="text-xs text-muted-foreground">OT críticas activas</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">MTTR</p>
            <p className="text-xl font-bold">{Number(mttrData?.averageMTTR || 0).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Promedio actual</p>
          </div>
        </CardContent>
      </Card>

      {assetId ? (
        <Card>
          <CardHeader>
            <CardTitle>Equipo seleccionado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedAsset ? (
              <>
                <div className="rounded-lg border border-border p-3">
                  <p className="font-semibold">{selectedAsset.asset_name || 'Equipo'}</p>
                  <p className="text-muted-foreground">{selectedAsset.asset_code || 'Sin código'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="font-semibold">{selectedAsset.asset_type || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Ubicación</p>
                    <p className="font-semibold">{selectedAsset.location || '-'}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Horómetro técnico</p>
                    <p className="font-semibold">{selectedAsset.mtbf_hours ? `${selectedAsset.mtbf_hours} h` : 'Sin lectura'}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Última trazabilidad</p>
                    <p className="font-semibold">
                      {selectedHistory[0]?.created_at ? new Date(selectedHistory[0].created_at).toLocaleDateString('es-CL') : 'Sin registro'}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Familia detectada</p>
                  <p className="font-semibold">{selectedAssetFamily}</p>
                </div>
                <Button asChild className="w-full justify-between">
                  <Link href={`/dashboard/mantenimiento/${selectedAssetScope}/${assetId}/ficha`}>
                    Abrir ficha completa
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href={`/dashboard/mantenimiento/${selectedAssetScope}/${assetId}/qr`}>
                    Ver tarjeta QR
                    <QrCode className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                No pudimos cargar el equipo indicado.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Orden operativa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="ot">Orden de trabajo</Label>
            <select
              id="ot"
              className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
              value={selectedOtId}
              onChange={(event) => setSelectedOtId(event.target.value)}
            >
              <option value="">Selecciona una OT</option>
              {workOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.work_order_number || order.code || order.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="hours">Horas trabajadas</Label>
              <Input id="hours" type="number" step="0.1" min="0" value={hoursWorked} onChange={(event) => setHoursWorked(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={handleRegisterTime} disabled={registeringTime}>
                {registeringTime ? 'Guardando...' : 'Registrar horas'}
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="timeNotes">Descripción del trabajo</Label>
            <Textarea
              id="timeNotes"
              rows={3}
              value={timeNotes}
              onChange={(event) => setTimeNotes(event.target.value)}
              placeholder="Detalle breve de la tarea realizada"
            />
          </div>

          <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-semibold">Horómetro técnico</p>
            <p className="text-muted-foreground">
              {selectedAsset?.mtbf_hours ? `${selectedAsset.mtbf_hours} horas técnicas registradas en el activo` : 'Sin lectura directa aún en la base actual'}
            </p>
          </div>

          {timeEntries.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-semibold">Últimos registros de esta OT</p>
              {timeEntries.slice(0, 3).map((entry) => (
                <div key={entry.id} className="rounded-md bg-muted/40 p-2">
                  <p className="font-medium">{Number(entry.horas_trabajadas || 0).toFixed(1)} h</p>
                  <p className="text-xs text-muted-foreground">{entry.descripcion || 'Sin descripción'}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidencia del trabajo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="evidenceLabel">Nombre de evidencia</Label>
            <Input
              id="evidenceLabel"
              value={evidenceLabel}
              onChange={(event) => setEvidenceLabel(event.target.value)}
              placeholder="Foto, informe, respaldo o documento"
            />
          </div>
          <div>
            <Label htmlFor="evidenceFile">Archivo</Label>
            <Input id="evidenceFile" type="file" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} />
          </div>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={handleUploadEvidence} disabled={uploadingEvidence}>
            <Upload className="h-4 w-4" />
            {uploadingEvidence ? 'Subiendo...' : 'Subir evidencia'}
          </Button>

          {evidenceEntries.length > 0 ? (
            <div className="space-y-2">
              {evidenceEntries.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-semibold">{item.file_name || 'Archivo'}</p>
                  <p className="text-muted-foreground">{item.file_type || 'Archivo'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay evidencia cargada para esta OT.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3">
          <Button asChild className="justify-between">
            <Link href="/dashboard/mantenimiento/ordenes-trabajo/create">
              Crear orden de trabajo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          {assetId ? (
            <Button asChild variant="outline" className="justify-between">
              <Link href={`/dashboard/mantenimiento/${selectedAssetScope}/${assetId}/qr`}>
                Abrir QR del equipo
                <QrCode className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="justify-between">
            <Link href="/dashboard/mantenimiento/bitacora">
              Ver bitácora
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-between">
            <Link href="/dashboard/mantenimiento/planificacion">
              Ver planificación
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-between">
            <Link href="/dashboard/mantenimiento/gerencial">
              Dashboard gerencial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-between">
            <Link href="/dashboard/mantenimiento/vehiculos">
              Escanear o buscar QR
              <QrCode className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OT abiertas y urgentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {openOrders.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No hay órdenes abiertas en este momento.
            </div>
          ) : (
            openOrders.map((order) => (
              <div key={order.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{order.work_order_number || order.code || order.title}</p>
                    <p className="text-muted-foreground">{order.title}</p>
                  </div>
                  <Badge variant="outline">{statusLabel(String(order.status || ''))}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{order.asset_name || 'Sin equipo'}</span>
                  {order.scheduled_date ? <span>{formatWorkOrderDate(order.scheduled_date) || 'Sin fecha programada'}</span> : null}
                </div>
              </div>
            ))
          )}

          {urgentOrders.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Urgentes</p>
              {urgentOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
                  <p className="font-medium">{order.work_order_number || order.code || order.title}</p>
                  <p className="text-xs">{order.title}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal de mantencion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Horas</p>
              <p className="text-xl font-bold">{Number(personalSummary.totalHours || 0).toFixed(1)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="text-xl font-bold">{personalSummary.totalEntries || 0}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Técnicos</p>
              <p className="text-xl font-bold">{personalSummary.technicians || 0}</p>
            </div>
          </div>

          {technicians.length > 0 ? (
            <div className="space-y-2">
              {technicians.slice(0, 3).map((tech) => (
                <div key={tech.technicianId} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{tech.name || 'Técnico'}</p>
                    <Badge variant="outline">{Number(tech.hours || 0).toFixed(1)} h</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tech.entries} registros</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-muted-foreground">
              <Users className="h-4 w-4" />
              Todavía no hay registros de tiempo para resumir.
            </div>
          )}
        </CardContent>
      </Card>

      {recentEntries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Últimos registros de tiempo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentEntries.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <p className="font-semibold">{item.descripcion || 'Tiempo registrado'}</p>
                <p className="text-muted-foreground">{Number(item.horas_trabajadas || 0).toFixed(1)} h</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.fecha ? new Date(item.fecha).toLocaleDateString('es-CL') : 'Sin fecha'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {selectedHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Última trazabilidad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selectedHistory.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <p className="font-semibold">{item.work_order?.work_order_number || 'Sin OT'}</p>
                <p className="text-muted-foreground">{item.notes || item.parts_replaced || 'Mantencion registrada'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString('es-CL') : 'Sin fecha'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
