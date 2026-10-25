'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Copy, History, Printer, QrCode, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { inferMachineFamilyFromText } from '@/lib/maintenance/cost-center-machines';
import { formatWorkOrderDate } from '@/lib/maintenance/work-order-calendar-date.mjs';

type MaintenanceAsset = {
  id: string;
  asset_code?: string;
  asset_name?: string;
  asset_type?: string;
  location?: string;
  status?: string;
  manufacturer?: string;
  model?: string;
  criticality?: string;
  mtbf_hours?: number | null;
};

type WorkOrder = {
  id: string;
  status: string;
  work_order_number?: string;
  scheduled_date?: string | null;
  completion_date?: string;
  asset_id?: string | null;
};

type HistoryRow = {
  id: string;
  parts_cost?: number | null;
  labor_cost?: number | null;
  labor_hours?: number | null;
  created_at?: string | null;
  performed_by_name?: string | null;
  maintenance_type?: string | null;
  work_order?: {
    work_order_number?: string | null;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
  } | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  return payload;
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: 'Abierta',
    assigned: 'Asignada',
    in_progress: 'En progreso',
    completed: 'Completada',
    closed: 'Cerrada',
  };
  return labels[status] || status || 'Sin estado';
}

type AssetQrViewProps = {
  scope: 'vehiculos' | 'equipos';
};

export function AssetQrView({ scope }: AssetQrViewProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assetId = decodeURIComponent(String(params.id || ''));
  const [origin, setOrigin] = useState('https://www.motil.app');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const { data, error, isLoading } = useSWR(assetId ? `/api/maintenance/assets/${assetId}/history` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: workOrderData } = useSWR('/api/maintenance/work-orders', fetcher, {
    revalidateOnFocus: false,
  });

  const asset = data?.asset as MaintenanceAsset | undefined;
  const history = Array.isArray(data?.history) ? (data.history as HistoryRow[]) : [];
  const workOrders = Array.isArray(workOrderData?.workOrders) ? (workOrderData.workOrders as WorkOrder[]) : [];
  const assetOrders = useMemo(() => workOrders.filter((order) => String(order.asset_id || '') === assetId), [assetId, workOrders]);

  const machineFamily = useMemo(() => {
    const text = `${asset?.asset_name || ''} ${asset?.asset_type || ''} ${asset?.model || ''} ${asset?.manufacturer || ''}`;
    return inferMachineFamilyFromText(text);
  }, [asset?.asset_name, asset?.asset_type, asset?.model, asset?.manufacturer]);

  const openOrders = assetOrders.filter((order) => order.status === 'open' || order.status === 'assigned');
  const activeOrders = assetOrders.filter(
    (order) => order.status === 'open' || order.status === 'assigned' || order.status === 'in_progress',
  );
  const lastOrder = assetOrders[0];
  const recentOrders = assetOrders.slice(0, 3);
  const recentHistory = history.slice(0, 3);
  const lastHistory = history[0];
  const totalMaintenanceCost = history.reduce((sum, item) => sum + Number(item.parts_cost || 0) + Number(item.labor_cost || 0), 0);
  const totalLaborHours = history.reduce((sum, item) => sum + Number(item.labor_hours || 0), 0);
  const qrTargetUrl = `${origin}/dashboard/mantenimiento/${scope}/${assetId}/ficha`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrTargetUrl)}`;

  const copyLink = async () => {
    if (typeof navigator !== 'undefined') {
      try {
        await navigator.clipboard.writeText(qrTargetUrl);
        toast.success('Enlace copiado');
      } catch {
        toast.error('No se pudo copiar el enlace');
      }
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Cargando tarjeta QR del equipo...</div>;
  }

  if (error || !asset) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">QR no disponible</h1>
          <p className="mt-2 text-muted-foreground">No pudimos cargar la tarjeta de este activo desde la base real.</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/mantenimiento/${scope}`}>Volver a {scope === 'equipos' ? 'equipos' : 'vehiculos'}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarjeta QR del activo</h1>
          <p className="mt-2 text-muted-foreground">Acceso rápido a la ficha completa, historial y órdenes del activo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/dashboard/mantenimiento/${scope}/${asset.id}/ficha`}>
              <ArrowLeft className="h-4 w-4" />
              Volver a la ficha
            </Link>
          </Button>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="print:shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR del activo
            </CardTitle>
            <CardDescription>El codigo apunta a la ficha real del activo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center rounded-lg border border-border bg-white p-4">
              <img src={qrImageUrl} alt={`QR de ${asset.asset_name || 'activo'}`} className="h-64 w-64 object-contain" />
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Destino</p>
              <p className="break-all font-medium">{qrTargetUrl}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={copyLink}>
                <Copy className="h-4 w-4" />
                Copiar enlace
              </Button>
              <Button asChild variant="outline">
                <Link href={qrTargetUrl} target="_blank" rel="noreferrer">
                  Abrir ficha
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/dashboard/mantenimiento/ordenes-trabajo/create?assetId=${asset.id}`}>Crear OT</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="print:shadow-none">
            <CardHeader>
              <CardTitle>Ficha resumida del activo</CardTitle>
              <CardDescription>Datos clave para terreno y supervision</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Codigo</p>
                <p className="font-semibold">{asset.asset_code || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Nombre</p>
                <p className="font-semibold">{asset.asset_name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Estado</p>
                <p className="font-semibold">{asset.status || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipo</p>
                <p className="font-semibold">{asset.asset_type || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ubicación</p>
                <p className="font-semibold">{asset.location || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Criticidad</p>
                <p className="font-semibold">{asset.criticality || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fabricante</p>
                <p className="font-semibold">{asset.manufacturer || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Modelo</p>
                <p className="font-semibold">{asset.model || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Familia derivada</p>
                <p className="font-semibold">{machineFamily || 'Sin familia'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
            <Card className="print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">OT activas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{activeOrders.length}</div>
              </CardContent>
            </Card>
            <Card className="print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Abiertas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{openOrders.length}</div>
              </CardContent>
            </Card>
            <Card className="print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Ultima OT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold">{lastOrder?.work_order_number || 'Sin OT'}</div>
                <p className="text-xs text-muted-foreground">{lastOrder?.status ? statusLabel(lastOrder.status) : 'Sin historial aún'}</p>
              </CardContent>
            </Card>
            <Card className="print:shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Costo acumulado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">${Number(totalMaintenanceCost).toLocaleString('es-CL')}</div>
                <p className="text-xs text-muted-foreground">{totalLaborHours.toFixed(1)} horas registradas</p>
              </CardContent>
            </Card>
          </div>

          <Card className="print:shadow-none">
            <CardHeader>
              <CardTitle>Acceso a ficha completa</CardTitle>
              <CardDescription>Desde este QR se navega a la ficha completa con historial real y órdenes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild className="gap-2">
                <Link href={`/dashboard/mantenimiento/${scope}/${asset.id}/ficha`}>
                  <Wrench className="h-4 w-4" />
                  Abrir ficha completa
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/dashboard/mantenimiento/${scope}/${asset.id}/arbol`}>Ver arbol de fallas</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/dashboard/mantenimiento/${scope}`}>{scope === 'equipos' ? 'Volver a equipos' : 'Volver a vehículos y traslados'}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="print:shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Trazabilidad reciente
              </CardTitle>
              <CardDescription>Lo ultimo asociado a este activo, listo para terreno y supervision.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Familia</p>
                  <p className="font-semibold">{machineFamily || 'Sin familia derivada'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">OT activas</p>
                  <p className="font-semibold">{activeOrders.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mantenciones registradas</p>
                  <p className="font-semibold">{history.length}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/60 p-4">
                  <p className="mb-3 text-sm font-semibold">Ultimas OT</p>
                  <div className="space-y-3">
                    {recentOrders.length ? (
                      recentOrders.map((order) => {
                        const scheduledDate = formatWorkOrderDate(order.scheduled_date);
                        return (
                          <div key={order.id} className="rounded-md bg-muted/40 p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{order.work_order_number || order.id}</span>
                              <span className="text-xs text-muted-foreground">{statusLabel(order.status)}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {scheduledDate ? `Programada: ${scheduledDate}` : 'Sin fecha programada'}
                              {order.completion_date ? ` - cierre ${new Date(order.completion_date).toLocaleDateString('es-CL')}` : ''}
                            </p>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin OT registradas.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 p-4">
                  <p className="mb-3 text-sm font-semibold">Ultimas mantenciones</p>
                  <div className="space-y-3">
                    {recentHistory.length ? (
                      recentHistory.map((entry) => (
                        <div key={entry.id} className="rounded-md bg-muted/40 p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{entry.maintenance_type || 'Mantencion'}</span>
                            <span className="text-xs text-muted-foreground">
                              {entry.created_at ? new Date(entry.created_at).toLocaleDateString('es-CL') : 'Sin fecha'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.performed_by_name || 'Sin técnico'} - ${Number((entry.parts_cost || 0) + (entry.labor_cost || 0)).toLocaleString('es-CL')}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin mantenciones registradas.</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {lastHistory ? (
            <Card className="print:shadow-none">
              <CardHeader>
                <CardTitle>Ultima mantencion</CardTitle>
              <CardDescription>Registro real más reciente asociado al QR.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-semibold">{lastHistory.created_at ? new Date(lastHistory.created_at).toLocaleDateString('es-CL') : '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Técnico</p>
                  <p className="font-semibold">{lastHistory.performed_by_name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Costo total</p>
                  <p className="font-semibold">${Number((lastHistory.parts_cost || 0) + (lastHistory.labor_cost || 0)).toLocaleString('es-CL')}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
