'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertCircle, ArrowRight, Download, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useModuleAccess } from '@/hooks/use-module-access';

type ComponentIntervention = {
  id: string;
  name?: string | null;
  code?: string | null;
  status?: string | null;
  lastMaintenance?: string | null;
  daysSince?: number | null;
  vehicle?: {
    name?: string | null;
    code?: string | null;
  } | null;
};

type ComponentGroup = {
  id: string;
  name?: string | null;
  code?: string | null;
  vehicleType?: string | null;
  level?: string | number | null;
  totalInstances?: number | string | null;
  faultModes?: number | string | null;
  description?: string | null;
  degraded?: number | string | null;
  failures?: number | string | null;
  nextInterventions?: ComponentIntervention[];
};

type ComponentSummary = {
  totalTemplates?: number | string;
  totalComponents?: number | string;
  degraded?: number | string;
  failures?: number | string;
};

type ComponentsMayoresResponse = {
  summary?: ComponentSummary;
  componentsByTemplate?: ComponentGroup[];
};

const fetcher = async (url: string): Promise<ComponentsMayoresResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  return response.json();
};

function daysLabel(days?: number | null) {
  if (days === null || days === undefined) return 'Sin dato';
  if (days < 0) return `Vencido hace ${Math.abs(days)} días`;
  if (days === 0) return 'Hoy';
  return `Hace ${days} días`;
}

export function ComponentesMayoresBoard() {
  const { data, error, isLoading, mutate } = useSWR<ComponentsMayoresResponse>('/api/maintenance/componentes-mayores', fetcher);
  const { canEdit, ready } = useModuleAccess();
  const canManageComponents = ready && canEdit('mant_operaciones');
  const summary: ComponentSummary = data?.summary || { totalTemplates: 0, totalComponents: 0, degraded: 0, failures: 0 };
  const groups: ComponentGroup[] = Array.isArray(data?.componentsByTemplate) ? data.componentsByTemplate : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Control de componentes mayores</h1>
          <p className="mt-2 text-muted-foreground">Estado real de componentes críticos por vehículo y plantilla técnica.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageComponents ? <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/mantenimiento/componentes-mayores/importar">
              <Download className="h-4 w-4" />
              Importar Excel
            </Link>
          </Button> : null}
          <Button variant="outline" onClick={() => void mutate()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Recargar
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/mantenimiento/vehiculos">
              Vehículos y traslados
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link href="/dashboard/mantenimiento/gerencial">
              Gerencial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Plantillas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalTemplates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Componentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalComponents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Degradados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{summary.degraded}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">En fallo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.failures}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground">Acceso rápido a mantenimiento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Button asChild variant="outline" className="justify-between">
              <Link href="/dashboard/mantenimiento/costos">
                Costos
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between">
              <Link href="/dashboard/mantenimiento/personal">
                Personal
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between">
              <Link href="/dashboard/mantenimiento/vehiculos">
                Vehículos y traslados
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-between">
              <Link href="/dashboard/mantenimiento/gerencial">
                Gerencial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando componentes mayores...</div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            No fue posible cargar componentes mayores.
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No hay componentes mayores visibles en la base actual.
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {group.code} | {group.vehicleType || 'Sin tipo'} | Nivel {group.level}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{group.totalInstances} instancias</Badge>
                    <Badge variant="outline">{group.faultModes} fallas definidas</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{group.description || 'Sin descripción técnica'}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Degradados</p>
                    <p className="text-xl font-bold text-orange-500">{group.degraded}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">En fallo</p>
                    <p className="text-xl font-bold text-destructive">{group.failures}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Última mantención y estado</h3>
                  {(group.nextInterventions || []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No hay instancias registradas para este componente.
                    </div>
                  ) : (
                    (group.nextInterventions || []).map((component) => (
                      <div key={component.id} className="rounded-lg border border-border p-3 text-sm">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-medium">{component.name}</p>
                            <p className="text-muted-foreground">{component.code || '-'}</p>
                            {component.vehicle ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Vehículo: {component.vehicle.name} ({component.vehicle.code})
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">{component.status || 'Sin estado'}</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Última mantención: {component.lastMaintenance ? new Date(component.lastMaintenance).toLocaleDateString('es-CL') : 'Sin dato'}
                            </p>
                            <p className="text-xs text-muted-foreground">Hace {daysLabel(component.daysSince)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wrench className="h-3 w-3" />
                  La prioridad se define con el estado real del componente y la fecha de última mantención.
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
