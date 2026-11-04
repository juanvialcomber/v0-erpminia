'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Download, Image as ImageIcon } from 'lucide-react';
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

function EvidenceImage({ src, alt, className, compact = false }: { src?: string | null; alt: string; className: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className={compact ? 'flex h-full w-full items-center justify-center bg-muted' : 'flex min-h-64 w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center'}>
        <ImageIcon className={compact ? 'h-5 w-5 text-muted-foreground' : 'h-8 w-8 text-muted-foreground'} />
        {!compact ? <span className="text-sm text-muted-foreground">Vista web no disponible. El archivo original sigue conservado.</span> : null}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}

export function WorkOrderEvidenceAndApproval({ workOrderId, status }: { workOrderId: string; status?: string | null }) {
  const evidence = useSWR(`/api/maintenance/work-orders/${workOrderId}/evidence`, fetcher, {
    refreshInterval: 10 * 60 * 1000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 15_000,
  });
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
              <a href={primaryPhoto?.preview_url || primaryPhoto?.signed_url || '#'} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-muted">
                <EvidenceImage
                  src={primaryPhoto?.preview_url || primaryPhoto?.signed_url}
                  alt={primaryPhoto?.file_name || 'Evidencia principal de OT'}
                  className="max-h-[560px] w-full object-contain"
                />
              </a>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{formatDate(primaryPhoto?.created_at)}</span>
                  {primaryPhoto?.preview_transformed ? <span className="rounded border px-2 py-0.5">HEIC · vista web</span> : null}
                  {primaryPhoto?.preview_error ? <span className="text-destructive">{primaryPhoto.preview_error}</span> : null}
                </div>
                <div className="flex items-center gap-3">
                  <a href={primaryPhoto?.preview_url || primaryPhoto?.signed_url || '#'} target="_blank" rel="noreferrer" className="underline underline-offset-2">Abrir imagen</a>
                  {primaryPhoto?.download_url || primaryPhoto?.original_url ? (
                    <a href={primaryPhoto.download_url || primaryPhoto.original_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                      <Download className="h-3.5 w-3.5" />Descargar original
                    </a>
                  ) : null}
                </div>
              </div>
              {photos.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-2 print:hidden" aria-label="Miniaturas de evidencia">
                  {photos.map((photo: { id: string; file_name?: string | null; signed_url?: string | null; preview_url?: string | null; thumbnail_url?: string | null }, index: number) => {
                    const thumbnail = photo.thumbnail_url || photo.preview_url || photo.signed_url || null;
                    return (
                      <button key={photo.id} type="button" onClick={() => setSelectedPhotoId(photo.id)} aria-label={`Ver fotografía ${index + 1}`} aria-pressed={photo.id === primaryPhoto?.id} className={`h-20 w-24 shrink-0 overflow-hidden rounded-md border-2 bg-muted ${photo.id === primaryPhoto?.id ? 'border-primary' : 'border-transparent'}`}>
                        <EvidenceImage
                          src={thumbnail}
                          alt={photo.file_name || `Evidencia ${index + 1}`}
                          className="h-full w-full object-cover"
                          compact
                        />
                      </button>
                    );
                  })}
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
