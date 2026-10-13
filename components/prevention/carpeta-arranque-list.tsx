'use client';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, AlertCircle, Clock, CircleDot,
  ChevronDown, ChevronUp, Download, Send, Loader2, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// Tipos
interface DocSlot {
  id: string;
  slot_index: number;
  documento_nombre: string;
  file_name: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  uploaded_at: string | null;
  l1_status: 'cumple' | 'no_cumple' | null;
  l1_observaciones: string | null;
  l1_reviewed_at: string | null;
  l2_status: 'cumple' | 'no_cumple' | null;
  l2_observaciones: string | null;
  l2_reviewed_at: string | null;
}
interface Carpeta {
  id: string;
  empresa_nombre: string;
  empresa_rut: string | null;
  contacto_email: string;
  status: string;
  revisor_l1_nombre: string | null;
  revisor_l1_status: 'cumple' | 'no_cumple' | null;
  revisor_l1_fecha: string | null;
  revisor_l2_nombre: string | null;
  revisor_l2_status: 'cumple' | 'no_cumple' | null;
  revisor_l2_fecha: string | null;
  submitted_at: string | null;
  created_at: string;
  carpeta_documentos: DocSlot[];
}
// Ayudantes
function formatPeriodLabel(dateValue?: string | null) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pendiente:  { label: 'Pendiente',  icon: <Clock className="h-3 w-3" />,  className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  en_revision_l1:  { label: 'Revisión Nivel 1',  icon: <CircleDot className="h-3 w-3" />,  className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  en_revision_l2:  { label: 'Revisión Nivel 2',  icon: <CircleDot className="h-3 w-3" />,  className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  aprobado:  { label: 'Documentos aprobados',  icon: <CheckCircle2 className="h-3 w-3" />, className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  rechazado:  { label: 'Rechazado',  icon: <AlertCircle className="h-3 w-3" />, className: 'bg-red-500/10 text-red-500 border-red-500/20' },
};
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendiente;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', cfg.className)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}
// Dos puntos de color para el estado de Revisión L1 y L2 por documento
function ReviewDots({ l1, l2 }: { l1: DocSlot['l1_status']; l2: DocSlot['l2_status'] }) {
  const dotColor = (s: typeof l1) =>
    s === 'cumple' ? 'bg-green-500' : s === 'no_cumple' ? 'bg-red-500' : 'bg-yellow-400/70';
  return (
    <div className="flex items-center gap-1" title={`L1: ${l1 || 'pendiente'} | L2: ${l2 || 'pendiente'}`}>
      <span className={cn('h-2.5 w-2.5 rounded-full', dotColor(l1))} />
      <span className={cn('h-2.5 w-2.5 rounded-full', dotColor(l2))} />
    </div>
  );
}
// Modal de Revisión
interface ReviewState {
  slot_index: number;
  status: 'cumple' | 'no_cumple' | null;
  observaciones: string;
}
function ReviewModal({
  carpeta,
  level,
  slotIndex,
  onClose,
  onSaved,
}: {
  carpeta: Carpeta;
  level: 1 | 2;
  slotIndex?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const uploadedDocs = carpeta.carpeta_documentos.filter(d => d.file_name && (slotIndex === undefined || d.slot_index === slotIndex));
  const [reviews, setReviews] = useState<ReviewState[]>(
    uploadedDocs.map(d => ({
      slot_index: d.slot_index,
      status: level === 1 ? d.l1_status : d.l2_status,
      observaciones: level === 1 ? d.l1_observaciones || '' : d.l2_observaciones || '',
    }))
  );
  const [requireSecondReview, setRequireSecondReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setReview = (slotIndex: number, update: Partial<ReviewState>) => {
    setReviews(prev => prev.map(r => r.slot_index === slotIndex ? { ...r, ...update } : r));
  };
  const handleSave = async () => {
    for (const r of reviews) {
      if (r.status === 'no_cumple' && !r.observaciones.trim()) {
        setError(`El documento ${r.slot_index} requiere una observacion al marcar "No Cumple"`);
        return;
      }
    }
    const filledReviews = reviews.filter(r => r.status !== null);
    if (filledReviews.length === 0) {
      setError('Debes revisar al menos un documento');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/carpeta-arranque/${carpeta.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ level, reviews: filledReviews, ...(level === 1 ? { requireSecondReview } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Revisión Nivel {level} - {carpeta.empresa_nombre}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Marca cada documento como <strong>Cumple</strong> o <strong>No Cumple</strong>.
            Las observaciones son obligatorias al rechazar.
          </p>
          {level === 1 ? <a href="/dashboard/legal/aplicabilidad-eecc" target="_blank" rel="noopener noreferrer" className="inline-flex w-fit text-sm font-medium text-primary underline underline-offset-4">Verificar requisitos aplicables antes de aprobar ↗</a> : null}
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-3 py-2 pr-1">
          {uploadedDocs.map(doc => {
            const rev = reviews.find(r => r.slot_index === doc.slot_index)!;
            return (
              <div key={doc.slot_index} className={cn(
                'border rounded-lg p-3 space-y-2 transition-colors',
                rev.status === 'cumple' && 'border-green-500/40 bg-green-500/5',
                rev.status === 'no_cumple' && 'border-red-500/40 bg-red-500/5',
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium leading-snug">
                        {doc.slot_index}. {doc.documento_nombre}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{doc.file_name}</p>
                      {formatPeriodLabel(doc.uploaded_at) && (
                        <p className="text-xs text-primary/80 mt-0.5">
                          Período: {formatPeriodLabel(doc.uploaded_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setReview(doc.slot_index, { status: 'cumple', observaciones: '' })}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-semibold border transition-all',
                        rev.status === 'cumple'
                          ? 'bg-green-500 text-white border-green-500'
                          : 'border-border hover:border-green-500 hover:text-green-500'
                      )}
                    >
                      Cumple
                    </button>
                    <button
                      type="button"
                      onClick={() => setReview(doc.slot_index, { status: 'no_cumple' })}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-semibold border transition-all',
                        rev.status === 'no_cumple'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'border-border hover:border-red-500 hover:text-red-500'
                      )}
                    >
                      No Cumple
                    </button>
                  </div>
                </div>
                {rev.status === 'no_cumple' && (
                  <Textarea
                    placeholder="Observacion obligatoria (ej: Falta firma en el documento)"
                    value={rev.observaciones}
                    onChange={e => setReview(doc.slot_index, { observaciones: e.target.value })}
                    className="text-sm border-red-500/40 focus:border-red-500"
                    rows={2}
                  />
                )}
              </div>
            );
          })}
        </div>
        {level === 1 ? (
          <label className="flex items-start gap-3 rounded-md border border-border/70 p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={requireSecondReview} onChange={event => setRequireSecondReview(event.target.checked)} />
            <span><strong>Solicitar segunda aprobación</strong><span className="block text-xs text-muted-foreground">Opcional. Legal puede cerrar la revisión inicial o escalar a otro responsable. Los documentos observados siempre requieren corrección.</span></span>
          </label>
        ) : null}
        {error && (
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />{error}
          </p>
        )}
        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</> : <><Send className="h-4 w-4" />Guardar Revisión</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// Lista principal
export default function CarpetaArranqueList({ status }: { status: string }) {
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ carpeta: Carpeta; level: 1 | 2; slotIndex?: number } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/carpeta-arranque', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setCarpetas(data.carpetas || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = carpetas.filter(c => {
    if (status === 'todas') return true;
    if (status === 'en_revision_l1') return c.status === 'en_revision_l1' || (c.status === 'pendiente' && c.carpeta_documentos.some(d => d.file_name && !d.l1_status));
    if (status === 'en-revision') return ['en_revision_l1', 'en_revision_l2'].includes(c.status);
    return c.status === status;
  });
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Cargando carpetas...</span>
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No hay carpetas en este estado.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <div className="space-y-3">
        {filtered.map(carpeta => {
          const docs = carpeta.carpeta_documentos || [];
          const uploadedDocs = docs.filter(d => d.file_name);
          const isExpanded = expanded === carpeta.id;
          const totalDocs = docs.length;
          return (
            <Card key={carpeta.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Header row */}
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-base truncate">{carpeta.empresa_nombre}</h3>
                      <StatusBadge status={carpeta.status} />
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {carpeta.empresa_rut && (
                        <span className="text-xs text-muted-foreground">RUT: {carpeta.empresa_rut}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{carpeta.contacto_email}</span>
                      <span className="text-xs text-muted-foreground">
                        Creada: {new Date(carpeta.created_at).toLocaleDateString('es-CL')}
                      </span>
                      {formatPeriodLabel(carpeta.submitted_at || carpeta.created_at) && (
                        <span className="text-xs text-primary/90">
                          Período: {formatPeriodLabel(carpeta.submitted_at || carpeta.created_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : carpeta.id)}
                    className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
                {/* Progress + reviewer dots */}
                <div className="px-4 pb-3 space-y-3">
                  {/* Doc progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Documentos cargados</span>
                      <span className="font-semibold tabular-nums">{uploadedDocs.length}/{totalDocs}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${totalDocs ? (uploadedDocs.length / totalDocs) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  {/* L1 / L2 reviewer status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <span className={cn(
                        'h-2.5 w-2.5 rounded-full flex-shrink-0',
                        carpeta.revisor_l1_status === 'cumple' && 'bg-green-500',
                        carpeta.revisor_l1_status === 'no_cumple' && 'bg-red-500',
                        !carpeta.revisor_l1_status && 'bg-yellow-400/70',
                      )} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {carpeta.revisor_l1_nombre || 'Sin asignar'} - L1
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {carpeta.revisor_l1_status === 'cumple' ? 'Cumple' :
                           carpeta.revisor_l1_status === 'no_cumple' ? 'No Cumple' : 'Pendiente'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <span className={cn(
                        'h-2.5 w-2.5 rounded-full flex-shrink-0',
                        carpeta.revisor_l2_status === 'cumple' && 'bg-green-500',
                        carpeta.revisor_l2_status === 'no_cumple' && 'bg-red-500',
                        !carpeta.revisor_l2_status && 'bg-yellow-400/70',
                      )} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {carpeta.revisor_l2_nombre || 'Sin asignar'} - L2
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {carpeta.revisor_l2_status === 'cumple' ? 'Cumple' :
                           carpeta.revisor_l2_status === 'no_cumple' ? 'No Cumple' : 'Pendiente'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {carpeta.status === 'pendiente' && uploadedDocs.length === 0 && (
                    <p className="text-xs text-muted-foreground">Esperando documentos de la contratista. Sin archivos enviados, Legal no puede aprobar ni rechazar.</p>
                  )}
                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {carpeta.status === 'en_revision_l1' && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReviewing({ carpeta, level: 1 })}>
                        <CircleDot className="h-3.5 w-3.5" />Revisar (L1)
                      </Button>
                    )}
                    {carpeta.status === 'en_revision_l2' && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReviewing({ carpeta, level: 2 })}>
                        <CircleDot className="h-3.5 w-3.5" />Revisar (L2)
                      </Button>
                    )}
                  </div>
                </div>
                {/* Expanded: document grid */}
                {isExpanded && (
                  <div className="border-t mx-0 px-4 pb-4 pt-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Documentos</p>
                    {docs
                      .sort((a, b) => a.slot_index - b.slot_index)
                      .map(doc => (
                        <div key={doc.slot_index} className={cn(
                          'flex items-center justify-between gap-3 p-2 rounded-md border text-sm',
                          !doc.file_name && 'bg-muted/30 border-dashed',
                          doc.file_name && 'border-border',
                        )}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <ReviewDots l1={doc.l1_status} l2={doc.l2_status} />
                            <span className="text-xs text-muted-foreground flex-shrink-0 tabular-nums w-5">{doc.slot_index}.</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium leading-tight truncate">{doc.documento_nombre}</p>
                              {doc.file_name && (
                                <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                              )}
                              {formatPeriodLabel(doc.uploaded_at) && (
                                <p className="text-xs text-primary/80 mt-0.5">
                                  Período: {formatPeriodLabel(doc.uploaded_at)}
                                </p>
                              )}
                              {/* Show observations if any */}
                              {doc.l1_observaciones && (
                                <p className="text-xs text-red-500 mt-0.5">L1: {doc.l1_observaciones}</p>
                              )}
                              {doc.l2_observaciones && (
                                <p className="text-xs text-red-500 mt-0.5">L2: {doc.l2_observaciones}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {doc.file_name ? (
                              <Badge variant="secondary" className="text-xs">Cargado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Pendiente</Badge>
                            )}
                            {doc.file_name && ['pendiente', 'en_revision_l1'].includes(carpeta.status) && (
                              <Button size="sm" variant="outline" onClick={() => setReviewing({ carpeta, level: 1, slotIndex: doc.slot_index })}>Revisar documento</Button>
                            )}
                            {doc.file_path && (
                              <button
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Descargar"
                                onClick={async () => {
                                  const res = await fetch(`/api/carpeta-arranque/${carpeta.id}/downloadslot=${doc.slot_index}`, { credentials: 'include' });
                                  if (res.ok) {
                                    const { url } = await res.json();
                                    window.open(url, '_blank');
                                  }
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {reviewing && (
        <ReviewModal
          carpeta={reviewing.carpeta}
          level={reviewing.level}
          slotIndex={reviewing.slotIndex}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); load(); }}
        />
      )}
    </>
  );
}
