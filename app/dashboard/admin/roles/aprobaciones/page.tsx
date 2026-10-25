'use client';

import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las solicitudes');
  return data;
};

const MODULE_LABELS: Record<string, string> = {
  core_centros_costos_asignacion: 'Asignación de centros de costo',
  core_centros_costos: 'Centros de costo',
};

const STATUS_LABELS: Record<string, string> = {
  pending_area_manager: 'Pendiente de Jefatura de Área',
  pending_management: 'Pendiente de Gerencia',
  applied: 'Aprobada y aplicada',
  rejected: 'Rechazada',
};

const ACCESS_LABELS: Record<string, string> = {
  ED: 'Puede editar o asignar',
  LEC: 'Solo puede consultar',
  SR: 'Sin acceso',
};

export default function RoleMatrixApprovalsPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/role-matrix-changes', fetcher);
  const requests = data?.requests || [];
  const actor = data?.actor;

  const decide = async (id: string, stage: 'area_manager' | 'management', approve: boolean) => {
    const reason = approve ? null : window.prompt('Motivo del rechazo:')?.trim();
    if (!approve && !reason) return;
    const response = await fetch('/api/admin/role-matrix-changes', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, stage, approve, reason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert(result.error || 'No se pudo procesar la solicitud');
      return;
    }
    await mutate();
  };

  if (isLoading) return <StatePanel tone="loading" title="Cargando solicitudes" />;
  if (error) return <StatePanel tone="error" title="No se pudieron cargar las solicitudes" description={error.message} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Administración · Permisos</p>
        <h1 className="mt-1 text-3xl font-semibold">Solicitudes de permisos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Las solicitudes pasan por Jefatura de Área y Gerencia. Juan Admin puede cerrar sus solicitudes como superadministrador, sin una aprobación adicional de Gerencia.
        </p>
      </div>

      <div className="space-y-3">
        {requests.length === 0 ? (
          <StatePanel tone="neutral" title="No hay solicitudes" />
        ) : requests.map((request: any) => {
          const isRequester = request.requested_by === actor?.id;
          const sameAreaApprover = request.area_manager_approved_by === actor?.id;
          const actorRole = String(actor?.role || '').trim().toLowerCase();
          const isAdminPrincipal = actorRole === 'superadmin' || actorRole === 'super_admin';
          const canApproveArea =
            request.status === 'pending_area_manager' &&
            actor?.canApproveArea &&
            (!isRequester || isAdminPrincipal);
          const canBypassManagement =
            request.status === 'pending_management' &&
            actor?.canApproveManagement &&
            isRequester &&
            isAdminPrincipal;
          const canApproveManagement =
            request.status === 'pending_management' &&
            actor?.canApproveManagement &&
            (canBypassManagement || (!isRequester && !sameAreaApprover));
          const moduleLabel = MODULE_LABELS[request.module_key] || 'Permiso de módulo';
          const requestLabel = request.operation === 'delete'
            ? 'Retirar permiso'
            : request.module_key === 'core_centros_costos_asignacion'
              ? 'Permitir asignar centros de costo'
              : `Permiso solicitado: ${ACCESS_LABELS[request.requested_access_level] || 'En revisión'}`;

          return (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">
                      {request.cargos?.name || 'Cargo'} · {moduleLabel}
                    </CardTitle>
                    <CardDescription>{requestLabel}</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {STATUS_LABELS[request.status] || 'En revisión'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{request.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitado: {new Date(request.requested_at).toLocaleString('es-CL')}
                </p>
                {request.management_approval_bypassed_by ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Gerencia no intervino. El superadministrador solicitante aprobó y aplicó el cambio.
                  </p>
                ) : canBypassManagement ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Juan Admin puede cerrar esta solicitud ahora, sin aprobación de Gerencia.
                  </p>
                ) : isRequester && sameAreaApprover ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Juan Admin ya aprobó Jefatura de Área y puede cerrar la solicitud sin pasar por Gerencia.
                  </p>
                ) : isRequester && isAdminPrincipal ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Juan Admin puede aprobar la solicitud como superadministrador y cerrarla sin aprobación adicional de Gerencia.
                  </p>
                ) : isRequester ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    El solicitante no puede aprobar su propia solicitud. Debe revisarla otra persona.
                  </p>
                ) : request.status === 'pending_management' && sameAreaApprover ? (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    La aprobación de Gerencia debe realizarla una persona distinta.
                  </p>
                ) : null}
                {(canApproveArea || canApproveManagement) ? (
                  <div className="flex gap-2">
                    <Button onClick={() => decide(request.id, canApproveArea ? 'area_manager' : 'management', true)}>
                      {canBypassManagement ? 'Aprobar sin Gerencia' : 'Aprobar'}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => decide(request.id, canApproveArea ? 'area_manager' : 'management', false)}
                    >
                      Rechazar
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
