'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkOrderFluidUsagePanel } from '@/components/maintenance/work-order-fluid-usage-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload;
};

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export function WorkOrderEvidenceAndApproval({ workOrderId, status }: { workOrderId: string; status?: string | null }) {
  const evidence = useSWR(`/api/maintenance/work-orders/${workOrderId}/evidence`, fetcher);
  const review = useSWR(status === 'completed' ? `/api/maintenance/work-orders/${workOrderId}/review` : null, fetcher);
  const fluidClosureEvidence = useSWR(status === 'completed' ? `/api/maintenance/work-orders/${workOrderId}/fluids/closure` : null, fetcher);

  const photos = evidence.data?.evidence || [];
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const primaryPhoto = photos.find((photo: { id: string }) => photo.id === selectedPhotoId) || photos[0];
  const currentReview = review.data?.review;
  const canApprove = Boolean(review.data?.canApprove);
  const [confirmMaterialsInstalled, setConfirmMaterialsInstalled] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [fluidUsedChoice, setFluidUsedChoice] = useState<'yes' | 'no' | ''>('');
  const [fluidWasteChoice, setFluidWasteChoice] = useState<'linked' | 'none_recovered' | ''>('');
  const [fluidDeclarationNote, setFluidDeclarationNote] = useState('');
  const [declaringFluids, setDeclaringFluids] = useState(false);
  const [fluidDeclarationError, setFluidDeclarationError] = useState<string | null>(null);
  const materialLines = review.data?.materialRequirementsCount ?? 0;
  const fluidClosure = review.data?.fluidClosure || null;
  const fluidClosurePayload = (fluidClosure?.payload || {}) as {
    fluids_used?: boolean;
    waste_status?: string;
    fluid_usage_count?: number;
    linked_waste_count?: number;
    note?: string | null;
  };
  const fluidUsage = Array.isArray(review.data?.fluidUsage) ? review.data.fluidUsage : [];

  const approve = async () => {
    setApproving(true);
    setApprovalError(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmMaterialsInstalled }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo aprobar la OT.');
      await review.mutate();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'No se pudo aprobar la OT.');
    } finally {
      setApproving(false);
    }
  };

  const declareFluids = async () => {
    if (!fluidClosureEvidence.data?.canDeclare) return;
    if (!fluidUsedChoice) return setFluidDeclarationError('Indica si se utilizaron aceites o fluidos.');
    if (fluidUsedChoice === 'yes' && !fluidWasteChoice) {
      return setFluidDeclarationError('Indica si el residuo fue recuperado.');
    }
    setDeclaringFluids(true);
    setFluidDeclarationError(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/fluids/closure`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fluids_used: fluidUsedChoice === 'yes',
          waste_status: fluidUsedChoice === 'no' ? 'not_applicable' : fluidWasteChoice,
          note: fluidDeclarationNote.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la declaración.');
      await Promise.all([fluidClosureEvidence.mutate(), review.mutate()]);
    } catch (error) {
      setFluidDeclarationError(error instanceof Error ? error.message : 'No se pudo guardar la declaración.');
    } finally {
      setDeclaringFluids(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evidencia fotográfica</CardTitle>
          <p className="text-sm text-muted-foreground">{photos.length ? `${photos.length} archivo${photos.length === 1 ? '' : 's'} registrado${photos.length === 1 ? '' : 's'}` : 'Sin evidencia registrada.'}</p>
        </CardHeader>
        <CardContent>
          {photos.length ? (
            <div className="space-y-3">
              <a href={primaryPhoto?.signed_url || '#'} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-muted">
                {primaryPhoto?.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={primaryPhoto.signed_url} alt={primaryPhoto.file_name || 'Evidencia principal de OT'} className="max-h-[560px] w-full object-contain" />
                ) : <div className="flex min-h-64 items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>}
              </a>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{formatDate(primaryPhoto?.created_at)}</span>
                <span>Abrir imagen completa</span>
              </div>
              {photos.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-2 print:hidden" aria-label="Miniaturas de evidencia">
                  {photos.map((photo: { id: string; file_name?: string | null; signed_url?: string | null }, index: number) => (
                    <button key={photo.id} type="button" onClick={() => setSelectedPhotoId(photo.id)} aria-label={`Ver fotografía ${index + 1}`} aria-pressed={photo.id === primaryPhoto?.id} className={`h-20 w-24 shrink-0 overflow-hidden rounded-md border-2 bg-muted ${photo.id === primaryPhoto?.id ? 'border-primary' : 'border-transparent'}`}>
                      {photo.signed_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.signed_url} alt={photo.file_name || `Evidencia ${index + 1}`} className="h-full w-full object-cover" />
                      ) : <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {status === 'completed' ? (
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aceites y residuos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fluidClosure ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Registrado por mecánico</Badge>
                  <span className="text-sm text-muted-foreground">{fluidClosure.actor_name || 'Mecánico asignado'} · {formatDate(fluidClosure.event_at)}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">Fluidos usados</p><p className="mt-1 text-sm font-medium">{fluidClosurePayload.fluids_used ? 'Sí' : 'No'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Registros</p><p className="mt-1 text-sm font-medium">{fluidUsage.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Residuo</p><p className="mt-1 text-sm font-medium">{fluidClosurePayload.waste_status === 'linked' ? 'Recuperado y registrado' : fluidClosurePayload.waste_status === 'none_recovered' ? 'No se recuperó' : 'No aplica'}</p></div>
                </div>
                {fluidUsage.length ? (
                  <div className="space-y-2">
                    {fluidUsage.map((row: any) => (
                      <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                        <span>{row.fluid_name}</span>
                        <span className="tabular-nums">{Number(row.quantity_liters || 0).toLocaleString('es-CL')} L</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {fluidClosurePayload.note ? <p className="text-sm text-muted-foreground">Nota: {fluidClosurePayload.note}</p> : null}
              </>
            ) : currentReview?.status === 'approved' ? (
              <p className="text-sm text-muted-foreground">Esta OT fue aprobada antes de exigir la declaración de aceites y fluidos. El histórico no permite determinar si se utilizaron.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-destructive">Falta la declaración obligatoria del mecánico asignado.</p>
                {fluidClosureEvidence.error ? (
                  <p role="alert" className="text-sm text-destructive">No se pudo comprobar el permiso para declarar aceites y fluidos.</p>
                ) : fluidClosureEvidence.isLoading ? (
                  <p className="text-sm text-muted-foreground">Verificando quién puede completar la declaración…</p>
                ) : fluidClosureEvidence.data?.canDeclare ? (
                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">Esta OT ya está cerrada. Como mecánico asignado puedes completar la declaración pendiente; se registrará con fecha actual, sin reabrir ni alterar la OT.</p>
                    <p className="text-sm font-medium">¿Se utilizaron aceites o fluidos?</p>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant={fluidUsedChoice === 'yes' ? 'default' : 'outline'} onClick={() => { setFluidUsedChoice('yes'); setFluidWasteChoice(''); setFluidDeclarationError(null); }}>Sí</Button>
                      <Button type="button" size="sm" variant={fluidUsedChoice === 'no' ? 'default' : 'outline'} onClick={() => { setFluidUsedChoice('no'); setFluidWasteChoice(''); setFluidDeclarationError(null); }}>No</Button>
                    </div>
                    {fluidUsedChoice === 'no' ? (
                      <p className="text-sm text-muted-foreground">Sin uso de aceites: no se requieren litros ni registro de residuos.</p>
                    ) : null}
                    {fluidUsedChoice === 'yes' ? (
                      <div className="space-y-3">
                        <WorkOrderFluidUsagePanel workOrderId={workOrderId} />
                        <p className="text-sm font-medium">¿Qué ocurrió con el residuo?</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant={fluidWasteChoice === 'linked' ? 'default' : 'outline'} onClick={() => setFluidWasteChoice('linked')}>Recuperado y registrado</Button>
                          <Button type="button" size="sm" variant={fluidWasteChoice === 'none_recovered' ? 'default' : 'outline'} onClick={() => setFluidWasteChoice('none_recovered')}>No se recuperó</Button>
                        </div>
                      </div>
                    ) : null}
                    {fluidUsedChoice ? <Input value={fluidDeclarationNote} onChange={(event) => setFluidDeclarationNote(event.target.value)} placeholder="Observación (opcional)" aria-label="Observación de declaración de fluidos" /> : null}
                    {fluidDeclarationError ? <p role="alert" className="text-sm text-destructive">{fluidDeclarationError}</p> : null}
                    <Button type="button" disabled={declaringFluids || !fluidUsedChoice || (fluidUsedChoice === 'yes' && !fluidWasteChoice)} onClick={() => void declareFluids()}>
                      {declaringFluids ? 'Guardando…' : fluidUsedChoice === 'no' ? 'Confirmar sin uso de aceites' : 'Confirmar aceites y residuos'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">La OT ya fue cerrada. El mecánico asignado debe abrir esta misma OT con su cuenta, confirmar Sí o No y guardar la declaración. Después Ariel podrá aprobarla.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {status === 'completed' ? (
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Aprobación</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {currentReview?.status === 'approved' ? (
                <>
                  <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />Aprobada</p>
                  <p className="mt-1 text-xs text-muted-foreground">{currentReview.reviewed_by_name || 'Supervisor'} · {formatDate(currentReview.reviewed_at)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{(review.data?.approvedInstallations || []).length} repuesto(s) registrados como instalados por aprobación · conciliación de bodega pendiente</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Pendiente de aprobación</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ariel López revisa la evidencia, los aceites/fluidos y el residuo declarado por el mecánico antes de aprobar la OT.</p>
                </>
              )}
            </div>
            {canApprove ? <div className="space-y-3">
              {materialLines > 0 ? <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmMaterialsInstalled} onChange={(event) => setConfirmMaterialsInstalled(event.target.checked)} className="mt-1" />
                <span>Confirmo que los {materialLines} repuestos requeridos fueron instalados. La regularización de bodega queda pendiente.</span>
              </label> : null}
              {approvalError ? <p role="alert" className="text-sm text-destructive">{approvalError}</p> : null}
              <Button onClick={() => void approve()} disabled={approving || (materialLines > 0 && !confirmMaterialsInstalled)}><CheckCircle2 className="mr-2 h-4 w-4" />{approving ? 'Aprobando…' : 'Aprobar OT'}</Button>
            </div> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
