'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api-client';
import type { SourceEvidenceRecord, SourceEvidenceResponse } from '@/lib/maintenance/source-evidence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatePanel } from '@/components/ui/state-panel';
import { WorkbookEvidenceIntake } from '@/components/maintenance/workbook-evidence-intake';

type SourceType = SourceEvidenceRecord['sourceType'];
type ReviewStatus = SourceEvidenceRecord['review']['status'];
type CatalogFilters = { query: string; source: SourceType | 'all'; review: ReviewStatus | 'all' };

const sourceLabels: Record<SourceType, string> = {
  planning_import: 'Importación de planificación',
  module_document: 'Documento de mantenimiento',
  whatsapp_attachment: 'Adjunto de WhatsApp',
};
const sourceDateLabels: Record<SourceEvidenceRecord['receivedAtKind'], string> = {
  received: 'Recibido', uploaded: 'Cargado', imported: 'Importado', registered: 'Registrado',
};

const fetcher = async (url: string): Promise<SourceEvidenceResponse> => {
  const response = await apiFetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los archivos de mantenimiento.');
  return payload as SourceEvidenceResponse;
};

export function filterSourceEvidence(records: SourceEvidenceRecord[], filters: CatalogFilters) {
  const query = filters.query.trim().toLocaleLowerCase('es-CL');
  return records.filter((record) => {
    if (filters.source !== 'all' && record.sourceType !== filters.source) return false;
    if (filters.review !== 'all' && record.review.status !== filters.review) return false;
    if (!query) return true;
    return [record.fileName, record.version, record.sender?.name, record.family]
      .some((value) => typeof value === 'string' && value.toLocaleLowerCase('es-CL').includes(query));
  });
}

function formatEvidenceDate(value: string | null | undefined) {
  if (!value) return 'Fecha no informada';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value)) return 'Fecha no válida';
    const [year, month, day] = value.split('-');
    return `${day}-${month}-${year}`;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no válida' : date.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
}

export function SourceEvidenceRow({ record, previousVersion, opening, error, onOpen, onExamineWorkbook }: {
  record: SourceEvidenceRecord;
  previousVersion?: SourceEvidenceRecord;
  opening: boolean;
  error?: string;
  onOpen: (record: SourceEvidenceRecord, originalRecord?: SourceEvidenceRecord) => void;
  onExamineWorkbook: (record: SourceEvidenceRecord) => void;
}) {
  const canOpen = record.original.status === 'available' && Boolean(record.original.url);
  const canExamineWorkbook = canOpen && record.sourceType === 'module_document' && /\.xlsx?$/i.test(record.fileName);
  const reviewTone = record.review.status === 'rejected' ? 'destructive' : 'outline';

  return <article className="space-y-3 rounded-md border p-4" aria-label={record.fileName}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="break-words text-sm font-semibold">{record.fileName}</h3>
        <p className="text-xs text-muted-foreground">
          {sourceLabels[record.sourceType]} · {record.sender?.name || 'Remitente no informado'}
        </p>
        <p className="text-xs text-muted-foreground">
          {record.version ? `Versión ${record.version}` : 'Versión no informada'} · {sourceDateLabels[record.receivedAtKind]}: {formatEvidenceDate(record.receivedAt)}
        </p>
      </div>
      {canOpen ? <Button type="button" variant="outline" className="min-h-10 shrink-0" onClick={() => onOpen(record)} disabled={opening}>
        {opening ? 'Abriendo origen…' : 'Ver origen'}
      </Button> : <p className="max-w-sm text-xs text-muted-foreground">
        {record.original.reason || 'Original no disponible. Adjunta el archivo para revisar su contenido.'}
      </p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Badge variant={reviewTone} className="max-w-full whitespace-normal text-left">{record.review.label}</Badge>
      <Badge variant="secondary" className="max-w-full whitespace-normal text-left">{record.extraction.label}</Badge>
      <Badge variant="outline" className="max-w-full whitespace-normal text-left">{record.applicability.label}</Badge>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <details className="text-xs">
      <summary className="min-h-10 cursor-pointer py-2 text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Detalles del archivo</summary>
      <dl className="mt-1 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Origen registrado</dt><dd className="mt-1 break-words">{record.locator.label}</dd></div>
        <div><dt className="text-muted-foreground">Revisión registrada</dt><dd className="mt-1">
          {record.reviewer ? `${record.reviewer.name || 'Responsable no informado'} · ${formatEvidenceDate(record.reviewer.reviewedAt)}` : 'Sin responsable ni fecha de revisión registrados'}
        </dd></div>
        {record.previousVersionId ? <div className="sm:col-span-2"><dt className="text-muted-foreground">Versión anterior vinculada</dt><dd className="mt-1">
          {previousVersion ? <><p className="break-words">{previousVersion.fileName}{previousVersion.version ? ` · Versión ${previousVersion.version}` : ''}</p>{previousVersion.original.status === 'available' && previousVersion.original.url ? <Button type="button" variant="outline" className="mt-2 min-h-10" disabled={opening} onClick={() => onOpen(record, previousVersion)}>Ver origen de la versión anterior</Button> : <p className="mt-1 text-muted-foreground">{previousVersion.original.reason || 'El original de la versión anterior no está disponible.'}</p>}</> : 'La referencia está registrada; el detalle de esa versión no está en los archivos cargados.'}
        </dd></div> : null}
        {record.family ? <div><dt className="text-muted-foreground">Familia indicada en la fuente</dt><dd className="mt-1">{record.family}</dd></div> : null}
        {record.interval ? <div><dt className="text-muted-foreground">Intervalo indicado en la fuente</dt><dd className="mt-1">
          {record.interval.text || (record.interval.value === null ? 'Valor no informado' : record.interval.value.toLocaleString('es-CL'))}
          {record.interval.unit ? ` · Unidad: ${record.interval.unit}` : ' · Unidad no informada'}
        </dd></div> : null}
        <div className="sm:col-span-2"><dt className="text-muted-foreground">{record.integrity.label}</dt><dd className="mt-1 break-all font-mono">{record.integrity.value || 'No registrada'}</dd></div>
      </dl>
      {record.notes.length ? <div className="mt-3 space-y-1 text-muted-foreground">{record.notes.map((note, index) => <p key={`${index}-${note}`}>{note}</p>)}</div> : null}
      {canExamineWorkbook ? <Button type="button" variant="outline" className="mt-3 min-h-10" onClick={() => onExamineWorkbook(record)}>Examinar hojas del Excel</Button> : null}
    </details>
  </article>;
}

export function TechnicalGuidelineLibrary() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<SourceEvidenceResponse>('/api/maintenance/source-evidence', fetcher, { revalidateOnFocus: false });
  const [filters, setFilters] = useState<CatalogFilters>({ query: '', source: 'all', review: 'all' });
  const [page, setPage] = useState(0);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [sourceDocument, setSourceDocument] = useState<{ id: string; fileName: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [originError, setOriginError] = useState<{ id: string; message: string } | null>(null);
  const openingLock = useRef(false);
  const records = useMemo(() => filterSourceEvidence(data?.data || [], filters), [data, filters]);
  const moduleDocuments = useMemo(() => new Map((data?.data || []).filter((record) => record.sourceType === 'module_document').map((record) => [record.sourceId, record])), [data]);
  const previousVersionOptions = useMemo(() => (data?.data || []).filter((record) => record.sourceType === 'module_document' && record.workbookEvidence?.eligiblePreviousVersion)
    .map((record) => ({ id: record.sourceId, fileName: record.fileName, version: record.version, receivedAtLabel: formatEvidenceDate(record.receivedAt) })), [data]);
  const pageSize = 12;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(records.length / pageSize) - 1));
  const visibleRecords = records.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  function updateFilter(patch: Partial<CatalogFilters>) { setFilters((current) => ({ ...current, ...patch })); setPage(0); }

  async function openOriginal(record: SourceEvidenceRecord, originalRecord = record) {
    if (openingLock.current || !originalRecord.original.url) return;
    openingLock.current = true;
    setOpeningId(record.id);
    setOriginError(null);
    let popup: Window | null = null;
    try {
      popup = window.open('about:blank', '_blank');
      if (popup) popup.opener = null;
      const response = await apiFetch(originalRecord.original.url, { headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo abrir el original. Vuelve a intentarlo.');
      if (typeof payload?.url !== 'string') throw new Error('El original no tiene un enlace disponible.');
      const url = new URL(payload.url, window.location.origin);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === window.location.origin)) throw new Error('El enlace del original no es válido.');
      if (popup) popup.location.replace(url.href);
      else window.location.assign(url.href);
    } catch (cause) {
      if (popup) popup.close();
      setOriginError({ id: record.id, message: cause instanceof Error ? cause.message : 'No se pudo abrir el original.' });
    } finally {
      openingLock.current = false;
      setOpeningId(null);
    }
  }

  return <section aria-label="Biblioteca de documentos de mantenimiento" className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold">Biblioteca de documentos de mantenimiento</h2>
        <p className="text-sm text-muted-foreground">Archivos y versiones recibidos, con su origen y revisión registrada.</p>
      </div>
      <Button type="button" variant="outline" className="min-h-10" aria-expanded={intakeOpen} aria-controls="maintenance-workbook-intake" onClick={() => setIntakeOpen((open) => !open)}>
        {intakeOpen ? 'Cerrar revisión de Excel' : 'Revisar un Excel'}
      </Button>
    </div>
    <div id="maintenance-workbook-intake" hidden={!intakeOpen}>
      <WorkbookEvidenceIntake sourceDocument={sourceDocument} previousVersionOptions={previousVersionOptions} onClearDocument={() => setSourceDocument(null)} onSaved={() => { void mutate(); }} />
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5"><label htmlFor="maintenance-evidence-search" className="text-sm font-medium">Buscar archivo o remitente</label>
        <Input id="maintenance-evidence-search" value={filters.query} onChange={(event) => updateFilter({ query: event.target.value })} placeholder="Texto del nombre, versión o remitente" className="min-h-10" />
      </div>
      <div className="space-y-1.5"><label htmlFor="maintenance-evidence-source" className="text-sm font-medium">Fuente</label>
        <select id="maintenance-evidence-source" value={filters.source} onChange={(event) => updateFilter({ source: event.target.value as CatalogFilters['source'] })} className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <option value="all">Todas las fuentes</option>
          {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><label htmlFor="maintenance-evidence-review" className="text-sm font-medium">Revisión</label>
        <select id="maintenance-evidence-review" value={filters.review} onChange={(event) => updateFilter({ review: event.target.value as CatalogFilters['review'] })} className="h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <option value="all">Todos los estados</option><option value="pending">Pendiente</option><option value="approved">Aprobación registrada</option><option value="rejected">Rechazado</option><option value="unknown">Sin revisión registrada</option>
        </select>
      </div>
    </div>
    {data?.availability.warnings.length ? <div role="status" className="space-y-1 rounded-md border p-3 text-sm text-muted-foreground">
      {data.availability.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}
    </div> : null}
    {isLoading ? <StatePanel tone="loading" title="Cargando archivos" description="Consultando documentos, importaciones y adjuntos disponibles." role="status" />
      : error ? <StatePanel tone="error" title="Biblioteca no disponible" description={error.message} role="alert" actions={<Button type="button" variant="outline" className="min-h-10" onClick={() => void mutate()}>Reintentar</Button>} />
        : data?.availability.status === 'unavailable' ? <StatePanel tone="error" title="No se pudieron consultar las fuentes" description="Vuelve a cargar la biblioteca para comprobar los archivos disponibles." role="alert" actions={<Button type="button" variant="outline" className="min-h-10" onClick={() => void mutate()}>Reintentar</Button>} />
          : !data?.data.length ? <StatePanel title="Aún no hay archivos disponibles" description="Revisa un Excel para conservar su original y preparar un borrador con sus hojas y celdas." />
            : records.length === 0 ? <StatePanel title="No hay coincidencias en los archivos cargados" description="La búsqueda compara el texto escrito con el nombre, la versión, el remitente y la familia indicada en la fuente." actions={<Button type="button" variant="outline" className="min-h-10" onClick={() => updateFilter({ query: '', source: 'all', review: 'all' })}>Limpiar filtros</Button>} />
              : <>
                <p role="status" className="text-xs text-muted-foreground">{records.length.toLocaleString('es-CL')} coincidencia{records.length === 1 ? '' : 's'} en {data.data.length.toLocaleString('es-CL')} archivos cargados{isValidating ? ' · Actualizando…' : ''}</p>
                <div className="space-y-3">{visibleRecords.map((record) => <SourceEvidenceRow key={record.id} record={record} previousVersion={record.previousVersionId ? moduleDocuments.get(record.previousVersionId) : undefined} opening={openingId === record.id} error={originError?.id === record.id ? originError.message : undefined} onOpen={(item, original) => void openOriginal(item, original)} onExamineWorkbook={(item) => { setSourceDocument({ id: item.sourceId, fileName: item.fileName }); setIntakeOpen(true); requestAnimationFrame(() => document.getElementById('maintenance-workbook-intake')?.scrollIntoView({ block: 'start' })); }} />)}</div>
                {records.length > pageSize ? <nav aria-label="Páginas de archivos" className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Página {currentPage + 1} de {Math.ceil(records.length / pageSize)}</p>
                  <div className="flex gap-2"><Button type="button" variant="outline" className="min-h-10" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" variant="outline" className="min-h-10" disabled={(currentPage + 1) * pageSize >= records.length} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div>
                </nav> : null}
              </>}
  </section>;
}
