import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const libraryPath = 'components/maintenance/technical-guideline-library.tsx';
const workbookPath = 'components/maintenance/workbook-evidence-intake.tsx';

function primitive(tag) {
  return ({ children, ...props }) => {
    const clean = { ...props };
    for (const key of ['variant', 'size', 'asChild']) delete clean[key];
    return React.createElement(tag, clean, children);
  };
}

function loadUi(file, { hooks = React, swr = {}, apiFetch = () => { throw new Error('Unexpected network request'); } } = {}) {
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const loaded = new Module(path.resolve(file));
  loaded.filename = path.resolve(file);
  loaded.paths = Module._nodeModulePaths(process.cwd());
  loaded.require = (id) => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id === 'swr') return () => ({ isLoading: false, isValidating: false, mutate() {}, ...swr });
    if (id === '@/lib/api-client') return { apiFetch };
    if (id === '@/components/ui/badge') return { Badge: primitive('span') };
    if (id === '@/components/ui/button') return { Button: primitive('button') };
    if (id === '@/components/ui/input') return { Input: primitive('input') };
    if (id === '@/components/ui/state-panel') return { StatePanel: ({ title, description, actions, role }) => React.createElement('div', { role }, title, description, actions) };
    if (id === '@/components/maintenance/workbook-evidence-intake') return { WorkbookEvidenceIntake: () => null };
    throw new Error(`Unexpected UI dependency: ${id}`);
  };
  loaded._compile(compiled, loaded.filename);
  return loaded.exports;
}

function sourceRecord(patch = {}) {
  return {
    id: 'module_document:source-one', sourceId: 'source-one', sourceType: 'module_document',
    fileName: 'MP250_generador.xlsx', documentType: 'workbook', version: '2', previousVersionId: null,
    receivedAt: '2026-10-18T01:30:00Z', receivedAtKind: 'uploaded',
    sender: { name: 'Ariel', id: null, role: null }, reviewer: null,
    integrity: { kind: 'unverified', value: 'abc123', label: 'Hash registrado; integridad del original sin verificar' },
    extraction: { status: 'partial', label: 'Extracción parcial' },
    review: { status: 'unknown', label: 'Sin revisión documental con responsable y fecha' },
    applicability: { status: 'unverified', label: 'Aplicabilidad técnica no acreditada' },
    original: { status: 'available', url: '/api/maintenance/source-evidence/module_document/source-one/origin', reason: null },
    locator: { kind: 'document', sheet: null, label: 'Documento completo', messageId: null },
    family: null, interval: { value: 250, unit: null, text: 'MP250' }, notes: [],
    ...patch,
  };
}

function catalog(records, patch = {}) {
  return {
    data: records,
    summary: { loaded: records.length, matched: records.length, originalsAvailable: records.length, pendingReview: 0, unknownApplicability: records.length },
    availability: { status: 'complete', limitPerSource: 200, sources: {}, warnings: [] },
    filters: { q: '', sourceType: null, review: null },
    ...patch,
  };
}

function cell(address, patch = {}) {
  return {
    address, row: 1, column: 1, type: 'n', value: 0, hasValue: true,
    format: null, text: null, formula: null, arrayFormulaRange: null,
    cachedValue: null, hasCachedValue: false, dependencies: [],
    style: null, hyperlink: null, comments: null, richText: null,
    ...patch,
  };
}

function workbook() {
  const first = [
    cell('A1', { type: 's', value: 'Unidad' }),
    cell('B1', { value: null, hasValue: false, formula: 'IF(A2=0,0,12)', cachedValue: 0, hasCachedValue: true }),
    cell('C1', { value: null, hasValue: false, formula: 'B1+1' }),
    cell('D1', { type: 'b', value: false }),
    cell('E1', { value: null, hasValue: false, arrayFormulaRange: 'D1:E1', cachedValue: 7, hasCachedValue: true }),
    ...Array.from({ length: 20 }, (_, index) => cell(`A${index + 2}`, { value: index + 1 })),
  ];
  return {
    schemaVersion: 'motil.workbook-evidence.v1',
    file: { name: 'maestro.xlsx', extension: 'xlsx', byteLength: 100, sha256: 'a'.repeat(64) },
    parser: { name: 'SheetJS', version: 'test-fixture' }, dateSystem: '1900',
    sheets: [
      { index: 0, name: 'ProgramaMaestro', visibility: 'visible', range: 'A1:E21', cells: first, mergedRanges: [], rowMetadata: null, columnMetadata: null },
      { index: 1, name: 'Criterios', visibility: 'hidden', range: 'A1:A1', cells: [cell('A1', { value: 250 })], mergedRanges: [], rowMetadata: null, columnMetadata: null },
      { index: 2, name: 'SoporteDashboard', visibility: 'veryHidden', range: null, cells: [], mergedRanges: [], rowMetadata: null, columnMetadata: null },
    ],
    definedNames: [], calculationChain: null,
    counts: { sheets: 3, hiddenSheets: 2, cells: first.length + 1, formulaCells: 3, cachedFormulaCells: 2, mergedRanges: 0, definedNames: 0, dependencies: 0 },
    warnings: [], fidelity: { formulasCalculated: false, dependencies: 'lexical-evidence', originalIsAuthority: true },
  };
}

test('the actual document row shows missing authority and keeps MP250 units unknown', () => {
  const { SourceEvidenceRow } = loadUi(libraryPath);
  const html = renderToStaticMarkup(React.createElement(SourceEvidenceRow, { record: sourceRecord(), opening: false, onOpen() {}, onExamineWorkbook() {} }));
  assert.match(html, /MP250_generador.xlsx/);
  assert.match(html, /Unidad no informada/);
  assert.match(html, /Hash registrado; integridad del original sin verificar/);
  assert.match(html, /Sin revisión documental con responsable y fecha/);
  assert.match(html, /Aplicabilidad técnica no acreditada/);
  assert.match(html, /Ver origen/);
  assert.doesNotMatch(html, /250 horas|250 h\b|Documento revisado|Huella del archivo original/);
});

test('missing originals have a reason and cannot open or examine a nonexistent workbook', () => {
  const { SourceEvidenceRow } = loadUi(libraryPath);
  const record = sourceRecord({ original: { status: 'missing', url: null, reason: 'La importación no conserva el archivo original.' } });
  const html = renderToStaticMarkup(React.createElement(SourceEvidenceRow, { record, opening: false, onOpen() {}, onExamineWorkbook() {} }));
  assert.match(html, /La importación no conserva el archivo original/);
  assert.doesNotMatch(html, /Ver origen|Examinar hojas del Excel/);
});

test('a document exposes its registered predecessor and opens that original without guessing a version', () => {
  const { SourceEvidenceRow } = loadUi(libraryPath);
  const previous = sourceRecord({ id: 'module_document:older', sourceId: 'older', fileName: 'maestro-anterior.xlsx', version: '3' });
  const record = sourceRecord({ previousVersionId: 'older', version: '4' });
  let opened;
  const props = { record, previousVersion: previous, opening: false, onOpen: (...args) => { opened = args; }, onExamineWorkbook() {} };
  const html = renderToStaticMarkup(React.createElement(SourceEvidenceRow, props));
  assert.match(html, /Versión anterior vinculada/);
  assert.match(html, /maestro-anterior.xlsx · Versión 3/);
  const tree = SourceEvidenceRow(props);
  findElement(tree, (node) => node.props?.children === 'Ver origen de la versión anterior').props.onClick();
  assert.deepEqual(opened, [record, previous]);
  const missing = renderToStaticMarkup(React.createElement(SourceEvidenceRow, { ...props, previousVersion: undefined }));
  assert.match(missing, /el detalle de esa versión no está en los archivos cargados/);
  assert.doesNotMatch(missing, /Ver origen de la versión anterior/);
});

test('catalog search is literal and combines source and real review state', () => {
  const { filterSourceEvidence } = loadUi(libraryPath);
  const one = sourceRecord();
  const two = sourceRecord({ id: 'whatsapp_attachment:two', fileName: 'MP2500.xlsx', sourceType: 'whatsapp_attachment', review: { status: 'pending', label: 'Pendiente' }, sender: { name: 'Otra persona' } });
  assert.deepEqual(filterSourceEvidence([one, two], { query: 'ariel', source: 'all', review: 'unknown' }).map((row) => row.id), [one.id]);
  assert.deepEqual(filterSourceEvidence([one, two], { query: 'MP250_', source: 'module_document', review: 'all' }).map((row) => row.id), [one.id]);
  assert.equal(filterSourceEvidence([one, two], { query: '250 h', source: 'all', review: 'all' }).length, 0);
  assert.equal(filterSourceEvidence([one, two], { query: '', source: 'whatsapp_attachment', review: 'approved' }).length, 0);
});

test('the catalog presents partial coverage explicitly and renders a bounded page', () => {
  const records = Array.from({ length: 25 }, (_, index) => sourceRecord({ id: `document:${index}`, fileName: `archivo-${index}.xlsx` }));
  const data = catalog(records, { availability: { status: 'partial', limitPerSource: 200, sources: {}, warnings: ['Se muestran los últimos 200 documentos. WhatsApp no está disponible.'] } });
  const { TechnicalGuidelineLibrary } = loadUi(libraryPath, { swr: { data } });
  const html = renderToStaticMarkup(React.createElement(TechnicalGuidelineLibrary));
  assert.match(html, /WhatsApp no está disponible/);
  assert.match(html, /25 archivos cargados/);
  assert.equal((html.match(/<article /g) || []).length, 12);
  assert.match(html, /archivo-11.xlsx/);
  assert.doesNotMatch(html, /archivo-12.xlsx|Documento revisado|MP120/);
  assert.match(html, /Páginas de archivos/);
});

test('failed or loading sources do not claim an empty successful catalog', () => {
  for (const swr of [{ isLoading: true }, { error: new Error('No tienes acceso a mantenimiento.') }, { data: catalog([], { availability: { status: 'unavailable', limitPerSource: 200, sources: {}, warnings: [] } }) }]) {
    const { TechnicalGuidelineLibrary } = loadUi(libraryPath, { swr });
    const html = renderToStaticMarkup(React.createElement(TechnicalGuidelineLibrary));
    assert.doesNotMatch(html, /Aún no hay archivos disponibles/);
    assert.match(html, /Cargando archivos|Biblioteca no disponible|No se pudieron consultar las fuentes/);
  }
});

test('workbook cells keep formulas, stored zero/false, missing cache and array results distinct', () => {
  const { WorkbookCellEvidence } = loadUi(workbookPath);
  const cells = [...workbook().sheets[0].cells.slice(0, 5), cell('F1', { type: 'e', formula: '1/0', value: null, hasValue: false, cachedValue: 7, hasCachedValue: true, text: '#DIV/0!' })];
  const html = renderToStaticMarkup(React.createElement(WorkbookCellEvidence, { sheetName: 'ProgramaMaestro', cells }));
  assert.match(html, /ProgramaMaestro!B1/);
  assert.match(html, /=IF\(A2=0,0,12\)/);
  assert.match(html, /Valor almacenado en el archivo<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(html, /Sin valor almacenado/);
  assert.match(html, />false<\/dd>/);
  assert.match(html, /Fórmula no registrada en esta celda/);
  assert.match(html, /Rango de fórmula matricial: D1:E1/);
  assert.match(html, /Valor almacenado en el archivo<\/dt><dd[^>]*>7<\/dd>/);
  assert.match(html, /Error de Excel: #DIV\/0!/);
});

test('workbook preview includes every sheet and limits cell rendering without truncating the manifest', () => {
  const { WorkbookEvidencePreview } = loadUi(workbookPath);
  const manifest = workbook();
  const html = renderToStaticMarkup(React.createElement(WorkbookEvidencePreview, { manifest }));
  assert.match(html, /ProgramaMaestro/);
  assert.match(html, /Criterios/);
  assert.match(html, /SoporteDashboard/);
  assert.match(html, /Muy oculta/);
  assert.match(html, /3 hojas · 2 ocultas · 26 celdas · 3 fórmulas/);
  assert.equal((html.match(/<article /g) || []).length, 10);
  assert.equal(manifest.sheets[0].cells.length, 25);
  assert.match(html, /Páginas de celdas/);
  assert.match(html, /sin recalcular/);
});

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) { const found = findElement(child, predicate); if (found) return found; }
    return null;
  }
  if (predicate(node)) return node;
  return findElement(node.props?.children, predicate);
}

function hookHarness(file, componentName, options = {}) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const hooks = {
    ...React,
    useState(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], (next) => { slots[at] = typeof next === 'function' ? next(slots[at]) : next; }];
    },
    useRef(initial) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = { current: initial };
      return slots[at];
    },
    useMemo(compute) { cursor++; return compute(); },
    useEffect(callback, dependencies) {
      const at = cursor++;
      const previous = slots[at];
      if (!previous || dependencies.some((value, index) => value !== previous[index])) effects.push(callback);
      slots[at] = dependencies;
    },
  };
  const Component = loadUi(file, { ...options, hooks })[componentName];
  return {
    render(props) {
      cursor = 0;
      effects = [];
      const tree = Component(props);
      for (const callback of effects) callback();
      return tree;
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('intake analyzes without saving, then archives only after the explicit save action', async () => {
  const calls = [];
  let saved = 0;
  const manifest = workbook();
  const harness = hookHarness(workbookPath, 'WorkbookEvidenceIntake', { apiFetch: async (url, init) => {
    const action = init.body.get('action');
    calls.push({ url, action, file: init.body.get('file') });
    return { ok: true, json: async () => ({ ok: true, manifest, counts: manifest.counts, warnings: [], persisted: action === 'save-draft' }) };
  } });
  const props = { sourceDocument: null, onClearDocument() {}, onSaved() { saved++; } };
  let tree = harness.render(props);
  const file = new File(['native workbook fixture'], 'maestro.xlsx');
  findElement(tree, (node) => node.props?.id === 'maintenance-workbook-file').props.onChange({ target: { files: [file] } });
  tree = harness.render(props);
  findElement(tree, (node) => node.props?.children === 'Examinar todas las hojas').props.onClick();
  await settle();
  assert.deepEqual(calls.map((call) => call.action), ['analyze']);
  assert.equal(saved, 0);
  tree = harness.render(props);
  findElement(tree, (node) => node.props?.children === 'Guardar original y borrador').props.onClick();
  await settle();
  assert.deepEqual(calls.map((call) => call.action), ['analyze', 'save-draft']);
  assert.ok(calls.every((call) => call.url === '/api/maintenance/source-workbooks' && call.file.name === 'maestro.xlsx'));
  assert.equal(saved, 1);
  tree = harness.render(props);
  assert.equal(findElement(tree, (node) => node.props?.children === 'Guardar original y borrador'), null);
});

test('intake blocks repeated in-flight actions and exposes rejected analysis without enabling save', async () => {
  let resolveRequest;
  let calls = 0;
  const harness = hookHarness(workbookPath, 'WorkbookEvidenceIntake', { apiFetch: () => {
    calls++;
    return new Promise((resolve) => { resolveRequest = resolve; });
  } });
  const props = { sourceDocument: null, onClearDocument() {}, onSaved() { throw new Error('Failed analysis must not save'); } };
  let tree = harness.render(props);
  findElement(tree, (node) => node.props?.id === 'maintenance-workbook-file').props.onChange({ target: { files: [new File(['fixture'], 'maestro.xlsx')] } });
  tree = harness.render(props);
  const button = findElement(tree, (node) => node.props?.children === 'Examinar todas las hojas');
  button.props.onClick();
  button.props.onClick();
  assert.equal(calls, 1);
  resolveRequest({ ok: false, status: 403, json: async () => ({ ok: false, error: 'Sin permisos para este archivo.', code: 'FORBIDDEN' }) });
  await settle();
  tree = harness.render(props);
  assert.ok(findElement(tree, (node) => node.props?.role === 'alert' && node.props?.children === 'Sin permisos para este archivo.'));
  assert.equal(findElement(tree, (node) => node.props?.children === 'Guardar original y borrador'), null);
});

test('a save confirmed after changing workbooks refreshes the catalog without replacing the current view', async () => {
  const manifest = workbook();
  let resolvePending;
  let saved = 0;
  const harness = hookHarness(workbookPath, 'WorkbookEvidenceIntake', { apiFetch: async (_url, init) => {
    if (init.body instanceof FormData && init.body.get('action') === 'analyze') {
      return { ok: true, json: async () => ({ ok: true, manifest, counts: manifest.counts, warnings: [], persisted: false }) };
    }
    return new Promise((resolve) => { resolvePending = resolve; });
  } });
  const callbacks = { onClearDocument() {}, onSaved() { saved++; } };
  const uploadProps = { ...callbacks, sourceDocument: null };
  let tree = harness.render(uploadProps);
  findElement(tree, (node) => node.props?.id === 'maintenance-workbook-file').props.onChange({ target: { files: [new File(['fixture'], 'maestro.xlsx')] } });
  tree = harness.render(uploadProps);
  findElement(tree, (node) => node.props?.children === 'Examinar todas las hojas').props.onClick();
  await settle();
  tree = harness.render(uploadProps);
  findElement(tree, (node) => node.props?.children === 'Guardar original y borrador').props.onClick();

  const nextProps = { ...callbacks, sourceDocument: { id: 'next-workbook', fileName: 'otro-maestro.xlsx' } };
  harness.render(nextProps);
  resolvePending({ ok: true, json: async () => ({
    ok: true, manifest, counts: manifest.counts, warnings: [], persisted: true,
    document: { id: 'saved-workbook', fileName: 'maestro-archivado.xlsx', status: 'draft', sha256: manifest.file.sha256, version: 2 },
  }) });
  await settle();
  tree = harness.render(nextProps);
  assert.equal(saved, 1);
  assert.ok(findElement(tree, (node) => node.props?.role === 'status' && node.props?.children === 'Original y borrador guardados: maestro-archivado.xlsx.'));
  assert.ok(findElement(tree, (node) => node.type === 'strong' && node.props?.children === 'otro-maestro.xlsx'));
  assert.equal(findElement(tree, (node) => node.props?.manifest), null);
  assert.equal(findElement(tree, (node) => node.props?.children === 'Guardar original y borrador'), null);

  // An old read still must not display its manifest after another selection.
  findElement(tree, (node) => node.props?.children === 'Examinar todas las hojas').props.onClick();
  const latestProps = { ...callbacks, sourceDocument: { id: 'latest-workbook', fileName: 'tercer-maestro.xlsx' } };
  harness.render(latestProps);
  resolvePending({ ok: true, json: async () => ({ ok: true, manifest, counts: manifest.counts, warnings: [], persisted: false }) });
  await settle();
  tree = harness.render(latestProps);
  assert.equal(saved, 1);
  assert.ok(findElement(tree, (node) => node.type === 'strong' && node.props?.children === 'tercer-maestro.xlsx'));
  assert.equal(findElement(tree, (node) => node.props?.manifest), null);
});

test('an existing workbook is analyzed through its protected identity without resaving it', async () => {
  let sent;
  const manifest = workbook();
  const harness = hookHarness(workbookPath, 'WorkbookEvidenceIntake', { apiFetch: async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ ok: true, manifest, counts: manifest.counts, warnings: [], persisted: false }) };
  } });
  const props = { sourceDocument: { id: 'existing-document', fileName: 'maestro.xlsx' }, onClearDocument() {}, onSaved() { throw new Error('Reading an original must not resave it'); } };
  let tree = harness.render(props);
  findElement(tree, (node) => node.props?.children === 'Examinar todas las hojas').props.onClick();
  await settle();
  assert.deepEqual(sent, { action: 'analyze', sourceKind: 'module_document', sourceId: 'existing-document' });
  tree = harness.render(props);
  assert.equal(findElement(tree, (node) => node.props?.children === 'Guardar original y borrador'), null);
});

test('a predecessor is sent only after explicit selection for saving a new version', async () => {
  const actions = [];
  const manifest = workbook();
  const harness = hookHarness(workbookPath, 'WorkbookEvidenceIntake', { apiFetch: async (_url, init) => {
    const action = init.body.get('action');
    actions.push({ action, previous: init.body.get('previousVersionId') });
    return { ok: true, json: async () => ({ ok: true, manifest, counts: manifest.counts, warnings: [], persisted: action === 'save-draft' }) };
  } });
  const props = { sourceDocument: null, previousVersionOptions: [{ id: 'prior-document', fileName: 'maestro.xlsx', version: '1', receivedAtLabel: '18-10-2026' }], onClearDocument() {}, onSaved() {} };
  let tree = harness.render(props);
  findElement(tree, (node) => node.props?.id === 'maintenance-workbook-file').props.onChange({ target: { files: [new File(['new version'], 'maestro.xlsx')] } });
  tree = harness.render(props);
  findElement(tree, (node) => node.props?.children === 'Examinar todas las hojas').props.onClick();
  await settle();
  tree = harness.render(props);
  const selector = findElement(tree, (node) => node.props?.id === 'workbook-previous-version');
  assert.equal(selector.props.value, '');
  selector.props.onChange({ target: { value: 'prior-document' } });
  tree = harness.render(props);
  findElement(tree, (node) => node.props?.children === 'Guardar original y borrador').props.onClick();
  await settle();
  assert.deepEqual(actions, [{ action: 'analyze', previous: null }, { action: 'save-draft', previous: 'prior-document' }]);
});

test('origin errors remain in context and request a protected JSON URL explicitly', async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  let closed = false;
  let request;
  globalThis.window = { open: () => ({ opener: {}, close() { closed = true; }, location: { replace() { throw new Error('A missing original must not navigate'); } } }), location: { origin: 'https://lab.example.test' } };
  const record = sourceRecord();
  const harness = hookHarness(libraryPath, 'TechnicalGuidelineLibrary', { swr: { data: catalog([record]) }, apiFetch: async (url, init) => {
    request = { url, init };
    return { ok: false, json: async () => ({ error: 'El original ya no está disponible.' }) };
  } });
  let tree = harness.render();
  findElement(tree, (node) => node.props?.record?.id === record.id).props.onOpen(record);
  await settle();
  tree = harness.render();
  assert.equal(request.url, record.original.url);
  assert.equal(request.init.headers.Accept, 'application/json');
  assert.equal(closed, true);
  assert.equal(findElement(tree, (node) => node.props?.record?.id === record.id).props.error, 'El original ya no está disponible.');
});
