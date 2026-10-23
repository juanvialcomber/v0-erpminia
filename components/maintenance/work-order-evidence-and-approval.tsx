'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const photos = evidence.data?.evidence || [];
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const primaryPhoto = photos.find((photo: { id: string }) => photo.id === selectedPhotoId) || photos[0];
  const currentReview = review.data?.review;
  const canApprove = Boolean(review.data?.canApprove);
  const [confirmMaterialsInstalled, setConfirmMaterialsInstalled] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const materialLines = review.data?.materialRequirementsCount ?? 0;
  const approvalBlocker = review.data?.approvalBlocker || null;

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
                  <p className="mt-1 text-xs text-muted-foreground">Ariel López o Mauricio Astudillo revisan la evidencia y aprueban la OT.</p>
                  {approvalBlocker ? <p className="mt-2 text-xs font-medium text-destructive">{approvalBlocker}</p> : null}
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
