'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { WorkbookEvidenceManifest, WorkbookEvidenceResponse } from '@/lib/maintenance/workbook-evidence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatePanel } from '@/components/ui/state-panel';

type WorkbookSheet = WorkbookEvidenceManifest['sheets'][number];
type WorkbookCell = WorkbookSheet['cells'][number];
type StoredWorkbook = { id: string; fileName: string };
type PreviousWorkbookOption = StoredWorkbook & { version: string | null; receivedAtLabel: string };
type SuccessResponse = Extract<WorkbookEvidenceResponse, { ok: true }>;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const selectClassName = 'h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
const visibilityLabels = { visible: 'Visible', hidden: 'Oculta', veryHidden: 'Muy oculta' } as const;

function isFormulaCell(cell: WorkbookCell) {
  return cell.formula !== null || cell.arrayFormulaRange !== null;
}

function displayCellValue(value: WorkbookCell['value'], present: boolean, missingLabel: string, type: string, formatted: string | null) {
  if (!present) return missingLabel;
  if (type === 'e') return `Error de Excel: ${formatted || `código ${String(value)}`}`;
  if (value === null) return 'Valor nulo';
  if (value === '') return 'Texto vacío';
  return String(value);
}

export function WorkbookCellEvidence({ sheetName, cells }: { sheetName: string; cells: WorkbookCell[] }) {
  return <div className="space-y-2">
    {cells.map((cell) => <article key={cell.address} className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="break-all font-mono text-xs font-medium">{sheetName}!{cell.address}</h5>
        {isFormulaCell(cell) ? <Badge variant="outline">Fórmula</Badge> : <Badge variant="secondary">Valor de celda</Badge>}
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">{isFormulaCell(cell) ? 'Fórmula del archivo' : 'Valor original'}</dt>
          <dd className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{cell.formula !== null ? `=${cell.formula.replace(/^=/, '')}` : isFormulaCell(cell) ? 'Fórmula no registrada en esta celda' : displayCellValue(cell.value, cell.hasValue, 'Celda sin valor', cell.type, cell.text)}</dd>
        </div>
        {isFormulaCell(cell) ? <div><dt className="text-xs text-muted-foreground">Valor almacenado en el archivo</dt>
          <dd className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{displayCellValue(cell.cachedValue, cell.hasCachedValue, 'Sin valor almacenado', cell.type, cell.text)}</dd>
        </div> : cell.text !== null && cell.text !== String(cell.value ?? '') ? <div><dt className="text-xs text-muted-foreground">Texto con formato extraído</dt><dd className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words text-xs">{cell.text}</dd></div> : null}
      </dl>
      {cell.format ? <p className="mt-2 break-all text-xs text-muted-foreground">Formato de la celda: <span className="font-mono">{cell.format}</span></p> : null}
      {cell.arrayFormulaRange ? <p className="mt-2 text-xs text-muted-foreground">Rango de fórmula matricial: {cell.arrayFormulaRange}</p> : null}
      {cell.dependencies.length ? <details className="mt-1 text-xs">
        <summary className="min-h-10 cursor-pointer py-2 text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{cell.dependencies.length} referencia{cell.dependencies.length === 1 ? '' : 's'} en la fórmula</summary>
        <ul className="max-h-32 space-y-1 overflow-auto">
          {cell.dependencies.map((dependency, index) => <li key={`${index}-${dependency.raw}`} className="break-all font-mono">{dependency.raw}{dependency.external ? ' · Referencia externa' : ''}</li>)}
        </ul>
      </details> : null}
    </article>)}
  </div>;
}

export function WorkbookEvidencePreview({ manifest }: { manifest: WorkbookEvidenceManifest }) {
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [cellKind, setCellKind] = useState<'all' | 'formulas'>('all');
  const [cellQuery, setCellQuery] = useState('');
  const [page, setPage] = useState(0);
  const sheetCounts = useMemo(() => manifest.sheets.map((sheet) => ({
    cells: sheet.cells.length,
    formulas: sheet.cells.filter(isFormulaCell).length,
  })), [manifest]);
  const sheet = manifest.sheets[selectedSheet] || manifest.sheets[0];
  const matchingCells = useMemo(() => {
    const query = cellQuery.trim().toUpperCase().replace(/\$/g, '');
    return (sheet?.cells || []).filter((cell) => (cellKind !== 'formulas' || isFormulaCell(cell)) && (!query || cell.address.toUpperCase() === query));
  }, [sheet, cellKind, cellQuery]);
  const pageSize = 10;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matchingCells.length / pageSize) - 1));
  const visibleCells = matchingCells.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return <div className="space-y-4">
    <div className="space-y-1">
      <h4 className="break-words text-sm font-semibold">{manifest.file.name}</h4>
      <p className="text-xs text-muted-foreground">
        {manifest.counts.sheets.toLocaleString('es-CL')} hojas · {manifest.counts.hiddenSheets.toLocaleString('es-CL')} ocultas · {manifest.counts.cells.toLocaleString('es-CL')} celdas · {manifest.counts.formulaCells.toLocaleString('es-CL')} fórmulas
      </p>
      <p className="text-xs text-muted-foreground">Los valores almacenados corresponden al archivo recibido. Las fórmulas se conservan sin recalcular.</p>
    </div>
    <details open>
      <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Todas las hojas del archivo</summary>
      <div className="max-h-64 overflow-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Hojas visibles y ocultas, con recuento de celdas y fórmulas</caption>
          <thead className="sticky top-0 bg-muted"><tr><th scope="col" className="px-3 py-2">Hoja</th><th scope="col" className="px-3 py-2">Visibilidad</th><th scope="col" className="px-3 py-2 text-right">Celdas</th><th scope="col" className="px-3 py-2 text-right">Fórmulas</th></tr></thead>
          <tbody>{manifest.sheets.map((item, index) => <tr key={item.index} className="border-t">
            <th scope="row" className="max-w-44 break-words px-3 py-2 font-medium">{item.name}</th><td className="px-3 py-2">{visibilityLabels[item.visibility]}</td><td className="px-3 py-2 text-right tabular-nums">{sheetCounts[index].cells.toLocaleString('es-CL')}</td><td className="px-3 py-2 text-right tabular-nums">{sheetCounts[index].formulas.toLocaleString('es-CL')}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5"><label htmlFor="workbook-evidence-sheet" className="text-sm font-medium">Hoja a examinar</label>
        <select id="workbook-evidence-sheet" className={selectClassName} value={selectedSheet} onChange={(event) => { setSelectedSheet(Number(event.target.value)); setCellQuery(''); setPage(0); }}>
          {manifest.sheets.map((item, index) => <option key={item.index} value={index}>{item.name} · {visibilityLabels[item.visibility]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><label htmlFor="workbook-evidence-kind" className="text-sm font-medium">Contenido</label>
        <select id="workbook-evidence-kind" className={selectClassName} value={cellKind} onChange={(event) => { setCellKind(event.target.value as 'all' | 'formulas'); setPage(0); }}><option value="all">Todas las celdas</option><option value="formulas">Solo fórmulas</option></select>
      </div>
      <div className="space-y-1.5"><label htmlFor="workbook-evidence-cell" className="text-sm font-medium">Dirección exacta de celda</label><Input id="workbook-evidence-cell" className="min-h-10" value={cellQuery} onChange={(event) => { setCellQuery(event.target.value); setPage(0); }} placeholder="Por ejemplo: B12" /></div>
    </div>
    {sheet ? <div className="space-y-3">
      <p role="status" className="text-xs text-muted-foreground">{sheet.name} · {matchingCells.length.toLocaleString('es-CL')} celda{matchingCells.length === 1 ? '' : 's'}{sheet.range ? ` · Rango ${sheet.range}` : ''}</p>
      {visibleCells.length ? <WorkbookCellEvidence sheetName={sheet.name} cells={visibleCells} /> : <StatePanel title="No hay celdas para mostrar" description={cellQuery ? 'Comprueba la dirección de celda y el filtro de contenido.' : cellKind === 'formulas' ? 'Esta hoja no contiene fórmulas registradas.' : 'Esta hoja no contiene celdas registradas.'} className="min-h-0" />}
      {matchingCells.length > pageSize ? <nav aria-label="Páginas de celdas" className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Página {currentPage + 1} de {Math.ceil(matchingCells.length / pageSize)}</p><div className="flex gap-2"><Button type="button" variant="outline" className="min-h-10" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" variant="outline" className="min-h-10" disabled={(currentPage + 1) * pageSize >= matchingCells.length} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></div></nav> : null}
    </div> : null}
    <details className="text-xs">
      <summary className="min-h-10 cursor-pointer py-2 text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Información de conservación</summary>
      <dl className="space-y-2"><div><dt className="text-muted-foreground">Huella del archivo original</dt><dd className="mt-1 break-all font-mono">{manifest.file.sha256}</dd></div><div><dt className="text-muted-foreground">Otras estructuras conservadas</dt><dd className="mt-1">{manifest.counts.mergedRanges} rangos combinados · {manifest.counts.definedNames} nombres definidos · {manifest.counts.dependencies} referencias de fórmula</dd></div></dl>
      <p className="mt-2 text-muted-foreground">El manifiesto incluye todas las celdas extraídas. Las referencias identificadas en las fórmulas requieren cotejo para reproducir los cálculos.</p>
    </details>
  </div>;
}

export function WorkbookEvidenceIntake({ sourceDocument, previousVersionOptions = [], onClearDocument, onSaved }: {
  sourceDocument?: StoredWorkbook | null;
  previousVersionOptions?: PreviousWorkbookOption[];
  onClearDocument: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SuccessResponse | null>(null);
  const [error, setError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [previousVersionId, setPreviousVersionId] = useState('');
  const [busy, setBusy] = useState<'analyze' | 'save-draft' | null>(null);
  const inFlight = useRef(false);
  const requestGeneration = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const canSaveDraft = result?.capabilities?.canSaveDraft === true;

  useEffect(() => {
    requestGeneration.current += 1;
    setResult(null);
    setError('');
    setFile(null);
    setPreviousVersionId('');
    if (fileInput.current) fileInput.current.value = '';
  }, [sourceDocument?.id]);

  function chooseFile(selected: File | null) {
    if (inFlight.current) return;
    requestGeneration.current += 1;
    setResult(null);
    setError('');
    setFile(null);
    setPreviousVersionId('');
    if (!selected) return;
    if (!/\.xlsx?$/i.test(selected.name)) { setError('Selecciona el archivo Excel original en formato .xlsx o .xls.'); return; }
    if (selected.size > MAX_UPLOAD_BYTES) { setError('El archivo supera el límite de 3 MB de esta carga.'); return; }
    if (selected.size === 0) { setError('El archivo está vacío. Selecciona el Excel original.'); return; }
    setFile(selected);
  }

  async function submit(action: 'analyze' | 'save-draft') {
    if (inFlight.current || (!file && !sourceDocument)) return;
    if (action === 'save-draft' && (!file || !result || !canSaveDraft || result.persisted || sourceDocument)) return;
    inFlight.current = true;
    const generation = requestGeneration.current;
    setBusy(action);
    setError('');
    if (action === 'save-draft') setSaveNotice('');
    try {
      let init: RequestInit;
      if (sourceDocument) {
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'analyze', sourceKind: 'module_document', sourceId: sourceDocument.id }) };
      } else {
        const body = new FormData();
        body.append('file', file!);
        body.append('action', action);
        if (action === 'save-draft' && previousVersionId) body.append('previousVersionId', previousVersionId);
        init = { method: 'POST', body };
      }
      const response = await apiFetch('/api/maintenance/source-workbooks', init);
      const payload = await response.json().catch(() => null) as WorkbookEvidenceResponse | null;
      if (!response.ok || !payload?.ok) throw new Error(payload && !payload.ok ? payload.error : response.status === 413 ? 'El archivo supera el tamaño permitido para esta carga.' : 'No se pudo examinar el Excel. Vuelve a intentarlo.');
      // A confirmed write remains relevant if another workbook was selected
      // while it was in flight. Refresh the catalogue without replacing that view.
      if (action === 'save-draft' && payload.persisted) {
        setSaveNotice(`Original y borrador guardados: ${payload.document?.fileName || payload.manifest.file.name}.`);
        onSaved();
      }
      if (generation !== requestGeneration.current) return;
      setResult(payload);
    } catch (cause) {
      if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : 'No se pudo procesar el Excel.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function downloadManifest() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.manifest)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${result.manifest.file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]/gu, '_')}-evidencia.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section aria-label="Revisión de Excel" className="space-y-4 rounded-md border p-4 sm:p-5" aria-busy={busy !== null}>
    <div className="space-y-1"><h3 className="text-base font-semibold">Revisar el archivo original</h3><p className="text-sm text-muted-foreground">Examina sus hojas, celdas y fórmulas. Con permiso de escritura, también puedes conservar el original y un borrador para revisión.</p></div>
    {saveNotice ? <p role="status" className="break-words rounded-md border bg-muted/40 p-3 text-sm">{saveNotice}</p> : null}
    {sourceDocument ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="break-words text-sm">Archivo guardado: <strong>{sourceDocument.fileName}</strong></p><Button type="button" variant="outline" className="min-h-10" onClick={onClearDocument} disabled={busy !== null}>Elegir otro archivo</Button></div>
      : <div className="space-y-2"><label htmlFor="maintenance-workbook-file" className="text-sm font-medium">Archivo Excel</label><Input ref={fileInput} id="maintenance-workbook-file" type="file" accept=".xlsx,.xls" className="h-auto min-h-10 py-2" disabled={busy !== null} onChange={(event) => chooseFile(event.target.files?.[0] || null)} aria-describedby="maintenance-workbook-file-help" /><p id="maintenance-workbook-file-help" className="text-xs text-muted-foreground">Formatos .xlsx y .xls · Hasta 3 MB. Se incluyen las hojas ocultas.</p></div>}
    {error ? <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
    {!result ? <Button type="button" className="min-h-10" disabled={busy !== null || (!file && !sourceDocument)} onClick={() => void submit('analyze')}>{busy === 'analyze' ? 'Examinando archivo…' : 'Examinar todas las hojas'}</Button> : null}
    {busy ? <p role="status" className="text-sm text-muted-foreground">{busy === 'save-draft' ? 'Conservando el original y el borrador…' : 'Leyendo la estructura y las celdas del archivo…'}</p> : null}
    {result ? <>
      {file && !sourceDocument && !result.persisted && canSaveDraft ? <div className="space-y-1.5 border-t pt-4">
        <label htmlFor="workbook-previous-version" className="text-sm font-medium">Relación con archivos anteriores</label>
        <select id="workbook-previous-version" className={selectClassName} value={previousVersionId} disabled={busy !== null} onChange={(event) => setPreviousVersionId(event.target.value)}>
          <option value="">Archivo independiente · Primera versión</option>
          {previousVersionOptions.map((option) => <option key={option.id} value={option.id}>{option.fileName}{option.version ? ` · Versión ${option.version}` : ''} · {option.receivedAtLabel}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">Selecciona una evidencia previa si este archivo la actualiza. Se conserva el original anterior. Solo aparecen versiones elegibles entre los archivos cargados.</p>
      </div> : null}
      {file && !sourceDocument && !result.persisted && !canSaveDraft ? <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">{result.capabilities?.reason || 'No se pudo confirmar tu permiso para guardar. Puedes examinar el archivo y descargar el manifiesto.'}</p> : null}
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div><Badge variant="outline">{result.persisted ? `Borrador guardado${result.document?.version ? ` · Versión ${result.document.version}` : ''}` : sourceDocument ? 'Original ya guardado' : 'Vista previa'}</Badge><p className="mt-2 text-xs text-muted-foreground">{result.persisted ? `El original y la extracción están conservados para revisión.${result.document?.previousVersionId ? ' La versión anterior quedó vinculada.' : ''}` : sourceDocument ? 'Esta lectura corresponde al original archivado.' : canSaveDraft ? 'El archivo quedará archivado al guardar el borrador.' : 'Esta revisión no ha guardado el archivo en la biblioteca.'}</p></div>
        <div className="flex flex-wrap gap-2">
          {file && !sourceDocument && !result.persisted && canSaveDraft ? <Button type="button" className="min-h-10" disabled={busy !== null} onClick={() => void submit('save-draft')}>{busy === 'save-draft' ? 'Guardando…' : 'Guardar original y borrador'}</Button> : null}
          <Button type="button" variant="outline" className="min-h-10" onClick={downloadManifest} disabled={busy !== null}>Descargar manifiesto JSON</Button>
        </div>
      </div>
      {result.warnings.length ? <div role="status" className="space-y-1 rounded-md border p-3 text-sm text-muted-foreground">{result.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</div> : null}
      <WorkbookEvidencePreview key={result.manifest.file.sha256} manifest={result.manifest} />
    </> : null}
  </section>;
}
