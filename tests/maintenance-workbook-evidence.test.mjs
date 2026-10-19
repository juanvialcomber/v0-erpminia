import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { gunzipSync, gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(import.meta.dirname, '..');
const compiled = new Map();
function load(relativePath, injections = {}) {
  if (!compiled.has(relativePath)) compiled.set(relativePath, ts.transpileModule(readFileSync(path.join(root, relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const target = { exports: {} };
  runInNewContext(compiled.get(relativePath), {
    exports: target.exports, Buffer, Response, Uint8Array, console: injections.console ?? console,
    require(name) {
      if (Object.hasOwn(injections, name)) return injections[name];
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`, injections);
      if (name.startsWith('.')) return load(path.join(path.dirname(relativePath), `${name}.ts`), injections);
      return require(name);
    },
  });
  return target.exports;
}
const evidence = load('lib/maintenance/workbook-evidence.ts');
const manifestStorage = load('lib/maintenance/workbook-manifest-storage.ts');
const identity = load('lib/maintenance/workbook-evidence-identity.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function workbook() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['00123', 123, true], [45678.5, null, 'á & ñ']]);
  sheet.A2.z = 'yyyy-mm-dd hh:mm';
  sheet.D1 = { t: 'n', f: "'Oculta'!A1+B1", v: 999, z: '0.00' };
  sheet.E1 = { t: 'n', f: 'IF(TRUE,', v: 77 };
  sheet.Z99 = { t: 'z', z: '0.000' };
  sheet['!ref'] = 'A1:Z99';
  sheet['!merges'] = [XLSX.utils.decode_range('A3:C3')];
  sheet['!rows'] = [{ hidden: true }];
  XLSX.utils.book_append_sheet(book, sheet, 'Principal');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[7]]), 'Oculta');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[9]]), 'Muy oculta');
  book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }, { Hidden: 2 }],
    Names: [{ Name: 'Monto', Ref: 'Principal!$B$1', Comment: 'Importe original' }, { Name: 'Local', Ref: "'Oculta'!$A$1", Sheet: 1 }],
    WBProps: { date1904: true } };
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
}

function editZip(bytes, name, edit) {
  const container = XLSX.CFB.read(bytes, { type: 'buffer' });
  const index = container.FullPaths.findIndex((entry) => entry.endsWith(`/${name}`));
  assert.ok(index >= 0);
  const entry = container.FileIndex[index];
  entry.content = Buffer.from(edit(Buffer.from(entry.content).toString('utf8')));
  entry.size = entry.content.length;
  return XLSX.CFB.write(container, { type: 'buffer', fileType: 'zip', compression: true });
}

function emptyValueFixture() {
  return editZip(workbook(), 'xl/worksheets/sheet1.xml', (xml) => xml
    .replace(/<dimension[^>]*\/>/, '<dimension ref="A1:K2"/>')
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData><row r="1">
      <c r="A1" t="n"><f>1+2</f><v>999</v></c>
      <c r="B1" t="n"><f>1+2</f><v/></c>
      <c r="C1" t="str"><f>IF(A1=3,"","x")</f><v/></c>
      <c r="D1" t="n"><f>1+2</f></c>
      <c r="E1" t="b"><f>TRUE()</f><v/></c>
      <c r="F1" t="n"><v/></c>
      <c r="G1" t="b"><v/></c>
      <c r="H1" t="str"><v/></c>
      <c r="I1" t="n"><v>0</v></c>
      <c r="J1" t="b"><v>0</v></c>
      <c r="K1" t="n"><f>???((</f><v>77</v></c>
      </row><row r="2">
      <c r="A2"><f t="shared" si="0" ref="A2:B2">A1+1</f><v>1000</v></c>
      <c r="B2"><f t="shared" si="0"/><v>1</v></c>
      </row></sheetData>`));
}

test('workbook evidence preserves original bytes, all hidden sheets, values, addresses, formats, names and merges', () => {
  const bytes = workbook();
  const before = Buffer.from(bytes);
  const manifest = evidence.parseWorkbookEvidence(bytes, 'fuente.xlsx');
  assert.deepEqual(bytes, before);
  assert.equal(manifest.file.sha256, digest(before));
  assert.equal(manifest.dateSystem, '1904');
  assert.deepEqual(plain(manifest.sheets.map((sheet) => sheet.visibility)), ['visible', 'hidden', 'veryHidden']);
  assert.equal(manifest.counts.hiddenSheets, 2);
  const sheet = manifest.sheets[0];
  const cell = (address) => sheet.cells.find((entry) => entry.address === address);
  assert.equal(cell('A1').value, '00123');
  assert.equal(cell('C1').value, true);
  assert.equal(cell('A2').value, 45678.5);
  assert.equal(cell('A2').format, 'yyyy-mm-dd hh:mm');
  assert.equal(cell('C2').value, 'á & ñ');
  assert.equal(cell('D1').value, null);
  assert.equal(cell('D1').cachedValue, 999, 'a cached 999 is not recalculated as 130');
  assert.equal(cell('D1').formula, "'Oculta'!A1+B1");
  assert.equal(cell('D1').sourceXml.formula, "'Oculta'!A1+B1");
  assert.equal(cell('E1').formula, 'IF(TRUE,', 'invalid formulas stay evidence, never evaluated');
  assert.equal(cell('E1').cachedValue, 77);
  assert.ok(manifest.warnings.some((warning) => warning.includes('No se calcularon')));
  assert.deepEqual(plain(sheet.mergedRanges), ['A3:C3']);
  assert.equal(sheet.rowMetadata[0].hidden, true);
  assert.equal(manifest.definedNames[1].scopeSheetName, 'Oculta');
  assert.equal(manifest.definedNames[0].reference, 'Principal!$B$1');
});

test('empty numeric/boolean v never invents zero caches or literal values; explicit string empty caches remain empty strings', () => {
  const manifest = evidence.parseWorkbookEvidence(emptyValueFixture(), 'caches.xlsx');
  const cell = (address) => manifest.sheets[0].cells.find((entry) => entry.address === address);
  for (const address of ['B1', 'D1', 'E1']) {
    assert.equal(cell(address).hasCachedValue, false, address);
    assert.equal(cell(address).cachedValue, null, address);
    assert.equal(cell(address).text, null, address);
  }
  for (const address of ['F1', 'G1']) {
    assert.equal(cell(address).hasValue, false, address);
    assert.equal(cell(address).value, null, address);
    assert.equal(cell(address).text, null, address);
  }
  assert.equal(cell('C1').hasCachedValue, true);
  assert.equal(cell('C1').cachedValue, '');
  assert.equal(cell('H1').hasValue, true);
  assert.equal(cell('H1').value, '');
  assert.equal(cell('I1').value, 0);
  assert.equal(cell('J1').value, false);
  assert.equal(cell('K1').cachedValue, 77);
  assert.equal(cell('B1').sourceXml.value, '');
  assert.equal(Object.hasOwn(cell('D1').sourceXml, 'value'), false);
  assert.equal(cell('B2').sourceXml.formula, '', 'the shared formula source is not replaced by its expanded expression');
  assert.equal(cell('B2').formula, 'B1+1');
  assert.deepEqual(plain(cell('A2').sourceXml.formulaAttributes), { t: 'shared', si: '0', ref: 'A2:B2' });
});

test('references retain source spelling and avoid text literals, function names and structured table headings', () => {
  const refs = evidence.workbookFormulaReferences('SUM(\'Hoja 2\'!$B$2:C3,A1,Monto,INDIRECT("Z99"),LOG10(100),Tabla[A1])', 'Principal', ['Monto']);
  assert.deepEqual(plain(refs.map((ref) => ref.raw)), ["'Hoja 2'!$B$2:C3", 'A1', 'Monto']);
  const external = evidence.workbookFormulaReferences("'[externo.xlsx]Datos'!A1", 'Principal');
  assert.equal(external[0].external, true);
});

test('the original custom number format survives SheetJS escape normalization', () => {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[46000]]);
  sheet.A1.z = 'd.m';
  XLSX.utils.book_append_sheet(book, sheet, 'Format');
  const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
  assert.equal(evidence.parseWorkbookEvidence(bytes, 'format.xlsx').sheets[0].cells[0].format, 'd.m');
});

test('wrong formats, damaged archives and size/sheet/cell/manifest limits fail without partial extraction', () => {
  const bytes = workbook();
  assert.throws(() => evidence.parseWorkbookEvidence(bytes, 'fuente.csv'), { code: 'UNSUPPORTED_FORMAT' });
  assert.throws(() => evidence.parseWorkbookEvidence(Buffer.from('<html>renamed</html>'), 'fuente.xls'), { code: 'INVALID_XLS' });
  assert.throws(() => evidence.parseWorkbookEvidence(bytes.subarray(0, bytes.length - 8), 'fuente.xlsx'), { code: 'INVALID_XLSX' });
  for (const limits of [{ maxBytes: 10 }, { maxSheets: 2 }, { maxCells: 2 }, { maxManifestBytes: 100 }, { maxInflatedBytes: 10 }]) {
    assert.throws(() => evidence.parseWorkbookEvidence(bytes, 'fuente.xlsx', limits), { code: 'WORKBOOK_LIMIT_EXCEEDED' });
  }
});

test('XLS BIFF formula tokens and real numeric cached result are read without recalculating', () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[999]]), 'BIFF');
  const container = XLSX.CFB.read(XLSX.write(book, { type: 'buffer', bookType: 'xls' }), { type: 'buffer' });
  const index = container.FullPaths.findIndex((entry) => entry.endsWith('/Workbook'));
  const entry = container.FileIndex[index];
  const stream = Buffer.from(entry.content);
  let replaced = false;
  for (let offset = 0; offset + 4 <= stream.length;) {
    const kind = stream.readUInt16LE(offset);
    const size = stream.readUInt16LE(offset + 2);
    if (kind === 0x0203) {
      const payload = Buffer.alloc(29);
      stream.copy(payload, 0, offset + 4, offset + 10);
      payload.writeDoubleLE(999, 6);
      payload.writeUInt16LE(7, 20);
      Buffer.from([0x1e, 1, 0, 0x1e, 2, 0, 0x03]).copy(payload, 22);
      const header = Buffer.alloc(4); header.writeUInt16LE(0x0006, 0); header.writeUInt16LE(payload.length, 2);
      entry.content = Buffer.concat([stream.subarray(0, offset), header, payload, stream.subarray(offset + 4 + size)]);
      entry.size = entry.content.length;
      replaced = true;
      break;
    }
    offset += 4 + size;
  }
  assert.equal(replaced, true, 'fixture must contain a BIFF NUMBER record');
  const bytes = XLSX.CFB.write(container, { type: 'buffer' });
  const manifest = evidence.parseWorkbookEvidence(bytes, 'real-biff.xls');
  const cell = manifest.sheets[0].cells[0];
  assert.equal(cell.formula, '1+2');
  assert.equal(cell.cachedValue, 999);
  assert.equal(cell.value, null);
  assert.equal(manifest.file.sha256, digest(bytes));
});

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
class FakeNextResponse extends Response {
  static json(value, init) { return new FakeNextResponse(JSON.stringify(value), { ...init, headers: { 'content-type': 'application/json', ...init?.headers } }); }
}
function harness(options = {}) {
  const rows = new Map(); const objects = new Map(); const manifestObjects = new Map(); const calls = []; const diagnostics = [];
  let failures = options.insertFailures ?? 0;
  let inserted = false;
  const role = () => Object.hasOwn(options, 'role') ? options.role : options.denyRole ? 'lector' : 'admin';
  const database = {
    from(table) {
      if (table === 'profiles') return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      assert.equal(table, 'module_documents');
      const query = { columns: '', filters: [] };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(key, value) { query.filters.push((row) => row[key] === value); return builder; },
        is(key, value) { query.filters.push((row) => row[key] === value); return builder; },
        in(key, values) { query.filters.push((row) => values.includes(row[key])); return builder; },
        async maybeSingle() {
          calls.push({ kind: 'lookup', query });
          if (options.recoveryLookupError && inserted) return { data: null, ...options.recoveryLookupError };
          const row = [...rows.values()].find((entry) => query.filters.every((predicate) => predicate(entry)));
          if (!row) return { data: null, error: null };
          if (query.columns === 'manifest:extracted_data->manifest') return { data: { manifest: row.extracted_data.manifest }, error: null };
          return { data: { ...row, extraction_schema: row.extracted_data?.schemaVersion,
            manifest_schema: row.extracted_data?.manifest?.schemaVersion, extraction_file: row.extracted_data?.manifest?.file,
            extraction_counts: row.extracted_data?.manifest?.counts,
            manifest_representation: row.extracted_data?.manifestRepresentation,
            manifest_storage: row.extracted_data?.manifestStorage }, error: null };
        },
        async insert(row) {
          calls.push({ kind: 'insert', row });
          inserted = true;
          if (failures-- > 0) return options.insertError ?? { error: { code: 'FIXTURE_TEMPORARY_DB_ERROR' }, status: 503 };
          if (options.beforeInsert) {
            const outcome = await options.beforeInsert(row, { rows, objects, manifestObjects });
            if (outcome) return outcome;
          }
          if (options.archiveDuringInsert && !rows.has(row.id)) {
            rows.set(row.id, { ...row, is_active: false, deleted_at: '2026-10-18T18:00:00Z' });
          }
          if (rows.has(row.id)) return { error: { code: '23505' } };
          rows.set(row.id, { ...row, is_active: true, deleted_at: null });
          return { error: null };
        },
      };
      return builder;
    },
    storage: { from(bucket) {
      assert.ok(['module-documents', manifestStorage.WORKBOOK_MANIFEST_BUCKET].includes(bucket));
      const bucketObjects = bucket === 'module-documents' ? objects : manifestObjects;
      return {
        async upload(key, bytes, settings) {
          calls.push({ kind: 'upload', bucket, key, settings });
          assert.equal(settings.upsert, false);
          if (bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET && options.manifestUploadError) return options.manifestUploadError;
          if (bucketObjects.has(key)) return { error: { statusCode: '409' } };
          bucketObjects.set(key, Buffer.from(bytes)); return { error: null };
        },
        async download(key) {
          calls.push({ kind: 'download', bucket, key });
          if (options.archiveDuringDownload) {
            const row = [...rows.values()].find((entry) => entry.file_path === key);
            if (row) { row.is_active = false; row.deleted_at = '2026-10-18T18:00:00Z'; }
          }
          if (options.beforeDownload) await options.beforeDownload(bucket, key, { rows, objects, manifestObjects });
          if (bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET && options.manifestDownloadError) return options.manifestDownloadError;
          return bucketObjects.has(key) ? { data: new Blob([bucketObjects.get(key)]), error: null } : { error: { code: '404' } };
        },
      };
    } },
  };
  const organizationContext = load('lib/api/organization-context.ts', {
    'next/server': { NextResponse: FakeNextResponse },
    '@/lib/api/guard': { async requireAuth() { return { authorized: true, user: { id: USER }, organizationId: ORG, role: role() }; } },
    '@/lib/supabase-server': { getSupabaseServerClient: () => database },
    '@/lib/maintenance/workshop-site-scope': {},
  });
  const api = load('app/api/maintenance/source-workbooks/route.ts', {
    console: { error: (...args) => diagnostics.push(plain(args)) },
    'next/server': { NextResponse: FakeNextResponse },
    '@/lib/maintenance/workbook-evidence': { ...evidence, parseWorkbookEvidence(...args) {
      const manifest = evidence.parseWorkbookEvidence(...args);
      return options.transformManifest ? options.transformManifest(manifest) : manifest;
    } },
    '@/lib/api/module-access': { MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones' },
      async requireModuleAccess(_request, key, write = false) {
        calls.push({ kind: 'guard', key, write });
        const accessLevel = options.accessLevel ?? (options.readOnly ? 'LEC' : 'ED');
        const canWrite = accessLevel === 'ED';
        if (options.unauthenticated || accessLevel === 'SR' || (write && !canWrite)) return { authorized: false, response: FakeNextResponse.json({ error: 'No autorizado' }, { status: options.unauthenticated ? 401 : 403 }) };
        return { authorized: true, user: { id: USER }, organizationId: ORG, accessLevel, canWrite, role: role() };
      } },
    '@/lib/api/organization-context': { hasMaintenanceWriteRole: organizationContext.hasMaintenanceWriteRole, async getOrganizationContext(request) {
      calls.push({ kind: 'role-guard' });
      return organizationContext.getOrganizationContext(Object.assign(request, { nextUrl: new URL(request.url) }));
    } },
    '@/lib/supabase-server': { getSupabaseServerClient: () => database },
  });
  return { ...api, rows, objects, manifestObjects, calls, diagnostics };
}
function uploadRequest(bytes, action = 'analyze', extra = {}, gzip = true, fileName = 'fixture.xlsx') {
  const form = new FormData(); form.set('file', new Blob([bytes]), fileName); form.set('action', action);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return new Request('https://lab.invalid/api/maintenance/source-workbooks', { method: 'POST', body: form, headers: gzip ? { 'accept-encoding': 'gzip' } : {} });
}
function sourceRequest(id) {
  return new Request('https://lab.invalid/api/maintenance/source-workbooks', { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip' }, body: JSON.stringify({ action: 'analyze', sourceKind: 'module_document', sourceId: id, organizationId: 'spoofed' }) });
}
async function body(response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  return JSON.parse((response.headers.get('content-encoding') === 'gzip' ? gunzipSync(bytes) : bytes).toString('utf8'));
}

function legacyDraft(bytes, fileName = 'fixture.xlsx') {
  const manifest = evidence.parseWorkbookEvidence(bytes, fileName);
  const id = identity.workbookEvidenceDocumentId(ORG, manifest.file.sha256);
  return {
    id, organization_id: ORG, module: 'mantenimiento', category: 'source-workbooks', canonical_section: 'library',
    canonical_role: 'supporting', provenance_status: 'supporting', document_name: fileName,
    file_path: identity.workbookEvidenceStoragePath(ORG, id, 'xlsx'), file_size_bytes: bytes.length,
    status: 'draft', version: 1, previous_version_id: null, is_active: true, deleted_at: null,
    extracted_data: { schemaVersion: manifest.schemaVersion, manifest, review_status: 'unreviewed' },
  };
}

function storeArtifactFixture(api, row, manifest) {
  const artifact = manifestStorage.createWorkbookManifestArtifact(manifest, row.organization_id, row.id);
  row.extracted_data = { schemaVersion: manifest.schemaVersion, manifestRepresentation: manifestStorage.WORKBOOK_MANIFEST_REPRESENTATION,
    manifest: artifact.summary, manifestStorage: artifact.descriptor, review_status: 'unreviewed' };
  api.manifestObjects.set(artifact.descriptor.path, artifact.bytes);
  return artifact;
}

test('preview is authenticated MANT_OPERACIONES, tenant-bound and never persists', async () => {
  const denied = harness({ unauthenticated: true });
  assert.equal((await denied.POST(uploadRequest(workbook()))).status, 401);
  assert.equal(denied.calls.length, 1);
  const api = harness(); const response = await api.POST(uploadRequest(workbook()));
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.persisted, false);
  assert.deepEqual(result.capabilities, { canSaveDraft: true, reason: null });
  assert.deepEqual(api.calls.map((call) => call.kind), ['guard']);
});

test('save requires both module write and existing maintenance role gate', async () => {
  for (const options of [{ readOnly: true }, { denyRole: true }]) {
    const api = harness(options);
    assert.equal((await api.POST(uploadRequest(workbook(), 'save-draft'))).status, 403);
    assert.equal(api.objects.size, 0); assert.equal(api.rows.size, 0);
  }
});

test('analysis advertises the same module and role boundary enforced by saving, including super_admin', async () => {
  const cases = [
    { role: 'operador', accessLevel: 'LEC', allowed: false, reason: /solo lectura/ },
    { role: 'jefe_mantencion', accessLevel: 'LEC', allowed: false, reason: /solo lectura/ },
    { role: 'jefe_mina', accessLevel: 'ED', allowed: false, reason: /rol actual/ },
    { role: 'super_admin', accessLevel: 'ED', allowed: false, reason: /rol actual/ },
    { role: null, accessLevel: 'ED', allowed: false, reason: /rol actual/ },
    ...['admin', 'superadmin', 'operaciones-supervisor', 'jefe_mantencion', ' ADMIN '].map((role) => ({ role, accessLevel: 'ED', allowed: true })),
  ];
  const bytes = workbook();
  for (const scenario of cases) {
    const api = harness(scenario);
    const analyzed = await api.POST(uploadRequest(bytes));
    assert.equal(analyzed.status, 200, String(scenario.role));
    const preview = await body(analyzed);
    assert.equal(preview.capabilities.canSaveDraft, scenario.allowed, String(scenario.role));
    assert.equal(preview.persisted, false);
    assert.equal(api.objects.size, 0); assert.equal(api.rows.size, 0);
    if (!scenario.allowed) assert.match(preview.capabilities.reason, scenario.reason);
    const saved = await api.POST(uploadRequest(bytes, 'save-draft'));
    assert.equal(saved.status, scenario.allowed ? 200 : 403, String(scenario.role));
    if (scenario.allowed) assert.deepEqual((await body(saved)).capabilities, { canSaveDraft: true, reason: null });
    else {
      assert.equal(api.objects.size, 0); assert.equal(api.rows.size, 0);
      assert.equal(api.calls.some((call) => call.kind === 'upload' || call.kind === 'insert'), false);
    }
  }
});

test('saving rechecks module access when permission changes after analysis', async () => {
  const options = { role: 'jefe_mantencion', accessLevel: 'ED' };
  const api = harness(options); const bytes = workbook();
  assert.equal((await body(await api.POST(uploadRequest(bytes)))).capabilities.canSaveDraft, true);
  options.accessLevel = 'LEC';
  assert.equal((await api.POST(uploadRequest(bytes, 'save-draft'))).status, 403);
  assert.equal((await body(await api.POST(uploadRequest(bytes)))).capabilities.canSaveDraft, false);
  assert.equal(api.objects.size, 0); assert.equal(api.rows.size, 0);
});

test('explicit save stores original bytes and server-derived manifest once; retry returns the persisted extraction', async () => {
  const options = {}; const api = harness(options); const bytes = emptyValueFixture();
  const first = await body(await api.POST(uploadRequest(bytes, 'save-draft', { extractedData: '{"forged":true}', organizationId: 'spoofed' })));
  assert.equal(first.ok, true); assert.equal(first.persisted, true); assert.equal(first.reused, false);
  assert.deepEqual(first.capabilities, { canSaveDraft: true, reason: null });
  const row = api.rows.get(first.document.id);
  assert.equal(row.organization_id, ORG); assert.equal(row.status, 'draft');
  assert.equal(row.provenance_status, 'supporting'); assert.equal(row.canonical_role, 'supporting');
  assert.equal(row.extracted_data.manifest.file.sha256, digest(bytes));
  assert.deepEqual(api.objects.get(row.file_path), bytes);
  assert.equal(row.extracted_data.manifestRepresentation, 'storage-gzip-v1');
  assert.equal(Object.hasOwn(row.extracted_data.manifest, 'sheets'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(row)) < 16 * 1024);
  assert.deepEqual(JSON.parse(gunzipSync(api.manifestObjects.get(row.extracted_data.manifestStorage.path))), first.manifest);
  options.transformManifest = (manifest) => ({ ...manifest, warnings: [...manifest.warnings, 'New parser run marker'] });
  const second = await body(await api.POST(uploadRequest(bytes, 'save-draft', {}, true, 'renamed.xlsx')));
  assert.equal(second.reused, true); assert.equal(second.document.id, first.document.id);
  assert.deepEqual(second.capabilities, first.capabilities);
  assert.deepEqual(second.manifest, first.manifest, 'the complete persisted extraction wins over a new parser result and filename');
  assert.equal(second.document.fileName, 'fixture.xlsx');
  assert.equal(api.calls.filter((call) => call.kind === 'upload' && call.bucket === 'module-documents').length, 1);
  assert.equal(api.calls.filter((call) => call.kind === 'upload' && call.bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET).length, 1);
  assert.equal(api.rows.size, 1);
  api.objects.set(row.file_path, Buffer.from('corrupt bytes'));
  const conflict = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(conflict.status, 409); assert.equal((await body(conflict)).code, 'ORIGINAL_HASH_MISMATCH');
});

test('an existing inline v1 draft remains literal and is never migrated or rewritten during retry', async () => {
  const options = { transformManifest: (manifest) => ({ ...manifest, warnings: ['New parser marker'] }) };
  const api = harness(options); const bytes = emptyValueFixture(); const row = legacyDraft(bytes, 'stored.xlsx');
  row.extracted_data.manifest.warnings.push('Legacy persisted marker');
  api.rows.set(row.id, row); api.objects.set(row.file_path, bytes);
  const before = JSON.stringify(row);
  const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  assert.equal(saved.ok, true); assert.equal(saved.reused, true);
  assert.deepEqual(saved.manifest, plain(row.extracted_data.manifest));
  assert.equal(saved.document.fileName, 'stored.xlsx');
  assert.equal(JSON.stringify(row), before);
  assert.equal(api.manifestObjects.size, 0);
  assert.equal(api.calls.some((call) => call.kind === 'upload' || call.kind === 'insert'), false);
  options.archiveDuringDownload = true;
  const archived = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(archived.status, 409); assert.equal((await body(archived)).code, 'DOCUMENT_ARCHIVED');
});

test('failed DB insert retains immutable bytes and retries safely; concurrent identical saves create one PK', async () => {
  const api = harness({ insertFailures: 1 }); const bytes = workbook();
  const failed = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(failed.status, 503); assert.equal((await body(failed)).code, 'DRAFT_SAVE_INCOMPLETE');
  assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1); assert.equal(api.rows.size, 0);
  assert.equal((await api.POST(uploadRequest(bytes, 'save-draft'))).status, 200);
  assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1); assert.equal(api.rows.size, 1);
  const concurrent = harness();
  const results = await Promise.all([concurrent.POST(uploadRequest(bytes, 'save-draft')), concurrent.POST(uploadRequest(bytes, 'save-draft'))]);
  assert.ok(results.every((response) => response.status === 200));
  assert.equal(concurrent.rows.size, 1); assert.equal(concurrent.objects.size, 1); assert.equal(concurrent.manifestObjects.size, 1);
});

test('an original-only orphan is verified and completed under the same document identity without another version', async () => {
  const api = harness(); const bytes = workbook(); const orphan = legacyDraft(bytes);
  api.objects.set(orphan.file_path, Buffer.from(bytes));
  const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  assert.equal(saved.ok, true); assert.equal(saved.reused, false);
  assert.equal(saved.document.id, orphan.id); assert.equal(saved.document.version, 1);
  assert.equal(saved.document.previousVersionId, null);
  assert.equal(api.rows.size, 1); assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1);
  assert.deepEqual(api.objects.get(orphan.file_path), bytes);
  const sequence = api.calls.filter((call) => ['upload', 'download', 'insert'].includes(call.kind));
  assert.deepEqual(sequence.map((call) => [call.kind, call.bucket ?? 'database']), [
    ['upload', 'module-documents'], ['download', 'module-documents'],
    ['upload', manifestStorage.WORKBOOK_MANIFEST_BUCKET], ['download', manifestStorage.WORKBOOK_MANIFEST_BUCKET], ['insert', 'database'],
  ]);
  const compact = api.rows.get(orphan.id).extracted_data;
  assert.deepEqual(JSON.parse(gunzipSync(api.manifestObjects.get(compact.manifestStorage.path))), saved.manifest);
});

test('an existing gzip encoding can be reused only for the exact same complete JSON content', async () => {
  const api = harness(); const bytes = workbook(); const orphan = legacyDraft(bytes);
  const artifact = manifestStorage.createWorkbookManifestArtifact(orphan.extracted_data.manifest, ORG, orphan.id);
  const otherEncoding = gzipSync(Buffer.from(JSON.stringify(orphan.extracted_data.manifest)), { level: 9 });
  assert.notEqual(digest(otherEncoding), artifact.descriptor.gzipSha256);
  api.objects.set(orphan.file_path, bytes); api.manifestObjects.set(artifact.descriptor.path, otherEncoding);
  const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  assert.equal(saved.ok, true);
  const descriptor = api.rows.get(orphan.id).extracted_data.manifestStorage;
  assert.equal(descriptor.jsonSha256, artifact.descriptor.jsonSha256);
  assert.equal(descriptor.gzipSha256, digest(otherEncoding)); assert.equal(descriptor.gzipByteLength, otherEncoding.length);
  assert.deepEqual(api.manifestObjects.get(descriptor.path), otherEncoding, 'immutable bytes are never replaced');
});

test('a committed concurrent winner is returned literally even after an ambiguous INSERT error', async () => {
  const bytes = workbook();
  const api = harness({ async beforeInsert(row, state) {
    const winner = { ...row, document_name: 'winner.xlsx', is_active: true, deleted_at: null };
    const manifest = JSON.parse(gunzipSync(state.manifestObjects.get(row.extracted_data.manifestStorage.path)));
    manifest.file.name = 'winner.xlsx'; manifest.warnings.push('Persisted winner marker');
    storeArtifactFixture(state, winner, manifest); state.rows.set(winner.id, winner);
    return { error: { code: '', message: 'Transient connection lost after commit' }, status: 520 };
  } });
  const response = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(response.status, 200);
  const saved = await body(response);
  assert.equal(saved.reused, true); assert.equal(saved.document.fileName, 'winner.xlsx');
  assert.equal(saved.manifest.file.name, 'winner.xlsx');
  assert.ok(saved.manifest.warnings.includes('Persisted winner marker'));
  assert.equal(api.rows.size, 1); assert.equal(api.objects.size, 1);
  assert.equal(api.manifestObjects.size, 2, 'an unreferenced immutable loser is retained rather than race-deleted');
  assert.deepEqual(saved.capabilities, { canSaveDraft: true, reason: null });
});

test('a manifest upload failure leaves a recoverable original and never inserts a pointer without verified bytes', async () => {
  const options = { manifestUploadError: { error: { code: 'NoSuchBucket', statusCode: '400', message: 'private storage error' } } };
  const api = harness(options); const bytes = workbook();
  const response = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(response.status, 503); assert.equal((await body(response)).code, 'STORED_MANIFEST_UNAVAILABLE');
  assert.equal(api.rows.size, 0); assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 0);
  assert.equal(api.calls.some((call) => call.kind === 'insert'), false);
  assert.ok(api.diagnostics.some((entry) => entry[1].stage === 'manifest_upload' && entry[1].status === 400));
  delete options.manifestUploadError;
  const recovered = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(recovered.status, 200); assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1);
});

test('even a successful manifest upload must pass read-back verification before the compact INSERT', async () => {
  const api = harness({ beforeDownload(bucket, key, state) {
    if (bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET) state.manifestObjects.set(key, Buffer.from('damaged gzip'));
  } });
  const response = await api.POST(uploadRequest(workbook(), 'save-draft'));
  assert.equal(response.status, 409); assert.equal((await body(response)).code, 'STORED_MANIFEST_INVALID');
  assert.equal(api.rows.size, 0); assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1);
  assert.equal(api.calls.some((call) => call.kind === 'insert'), false);
});

test('invalid compact descriptors fail closed without fallback, foreign downloads, inserts or object changes', async () => {
  const bytes = workbook();
  const cases = [
    (data) => { data.manifestStorage = null; },
    (data) => { delete data.manifestRepresentation; },
    (data) => { data.manifestRepresentation = 'unknown'; },
    (data) => { data.manifestStorage.bucket = 'module-documents'; },
    (data) => { data.manifestStorage.path = data.manifestStorage.path.replace(ORG, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'); },
  ];
  for (const alter of cases) {
    const api = harness(); const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
    const row = api.rows.get(saved.document.id); alter(row.extracted_data);
    const before = JSON.stringify(row); const storedObjects = [...api.manifestObjects].map(([key, value]) => [key, digest(value)]);
    api.calls.length = 0;
    const response = await api.POST(uploadRequest(bytes, 'save-draft'));
    assert.equal(response.status, 409); assert.equal((await body(response)).code, 'STORED_MANIFEST_INVALID');
    assert.equal(api.calls.some((call) => call.kind === 'insert' || call.kind === 'upload' || (call.kind === 'download' && call.bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET)), false);
    assert.equal(JSON.stringify(row), before);
    assert.deepEqual([...api.manifestObjects].map(([key, value]) => [key, digest(value)]), storedObjects);
  }
});

test('missing or corrupt saved artifacts are never replaced by a fresh parser result', async () => {
  const bytes = workbook();
  for (const corruption of ['missing', 'bytes', 'counts']) {
    const api = harness(); const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
    const row = api.rows.get(saved.document.id); const key = row.extracted_data.manifestStorage.path;
    if (corruption === 'missing') api.manifestObjects.delete(key);
    else if (corruption === 'bytes') api.manifestObjects.set(key, Buffer.from('wrong compressed bytes'));
    else row.extracted_data.manifest.counts.cachedFormulaCells += 1;
    const before = JSON.stringify(row); api.calls.length = 0;
    const response = await api.POST(uploadRequest(bytes, 'save-draft'));
    assert.equal(response.status, corruption === 'missing' ? 503 : 409);
    assert.equal((await body(response)).code, corruption === 'missing' ? 'STORED_MANIFEST_UNAVAILABLE' : 'STORED_MANIFEST_INVALID');
    assert.equal(api.calls.some((call) => call.kind === 'insert' || call.kind === 'upload'), false);
    assert.equal(JSON.stringify(row), before);
  }
});

test('deletion or reference changes during a saved artifact download do not confirm a stale draft', async () => {
  const bytes = workbook();
  for (const change of ['delete', 'descriptor']) {
    const options = {}; const api = harness(options); const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
    const row = api.rows.get(saved.document.id);
    options.beforeDownload = (bucket, key, state) => {
      if (bucket !== manifestStorage.WORKBOOK_MANIFEST_BUCKET) return;
      if (change === 'delete') { row.deleted_at = '2026-10-19T11:00:00Z'; row.is_active = false; }
      else {
        const different = JSON.parse(gunzipSync(state.manifestObjects.get(key)));
        different.warnings.push('Metadata changed during read'); storeArtifactFixture(state, row, different);
      }
    };
    api.calls.length = 0;
    const response = await api.POST(uploadRequest(bytes, 'save-draft')); const result = await body(response);
    assert.equal(response.status, 409);
    assert.equal(result.code, change === 'delete' ? 'DOCUMENT_ARCHIVED' : 'EXISTING_DOCUMENT_CONFLICT');
    assert.equal(api.calls.some((call) => call.kind === 'insert' || call.kind === 'upload'), false);
  }
});

test('an INSERT 520 followed by recovery GET 521 preserves the primary diagnostic without leaking private data', async () => {
  const privateText = 'private-person-file.xlsx';
  const options = { insertFailures: 1,
    insertError: { status: 520, error: { code: '', message: privateText, details: `${ORG} ${USER}`, hint: 'payload must not escape' } },
    recoveryLookupError: { status: 521, error: { code: '57P03', message: privateText, details: ORG } },
  };
  const api = harness(options); const bytes = workbook();
  const response = await api.POST(uploadRequest(bytes, 'save-draft', {}, true, privateText));
  const result = await body(response);
  assert.equal(response.status, 503); assert.equal(result.code, 'DRAFT_SAVE_UNCONFIRMED');
  assert.deepEqual(result.details, { stage: 'document_insert', status: 520, code: 'UNCLASSIFIED', recoveryLookupFailed: true });
  assert.deepEqual(api.diagnostics.map((entry) => entry[1]), [
    { stage: 'document_lookup', status: 521, code: '57P03' }, { stage: 'document_insert', status: 520, code: 'UNCLASSIFIED' },
  ]);
  const exposed = JSON.stringify([result, api.diagnostics]);
  for (const secret of [privateText, ORG, USER, 'payload must not escape']) assert.equal(exposed.includes(secret), false);
  assert.equal(api.rows.size, 0); assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1);
  delete options.recoveryLookupError;
  assert.equal((await api.POST(uploadRequest(bytes, 'save-draft', {}, true, privateText))).status, 200);
  assert.equal(api.rows.size, 1); assert.equal(api.objects.size, 1); assert.equal(api.manifestObjects.size, 1);
});

test('an archived deterministic identity returns 409 before uploading or inserting without altering its tombstone', async () => {
  const api = harness(); const bytes = workbook();
  const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  const row = api.rows.get(saved.document.id);
  // deleted_at is authoritative even if a legacy record kept is_active=true.
  row.deleted_at = '2026-10-18T18:00:00Z';
  const snapshot = JSON.stringify(row);
  api.calls.length = 0;
  const response = await api.POST(uploadRequest(bytes, 'save-draft'));
  const rejected = await body(response);
  assert.equal(response.status, 409); assert.equal(rejected.code, 'DOCUMENT_ARCHIVED');
  assert.match(rejected.error, /documento eliminado/);
  assert.doesNotMatch(rejected.error, /reintent|inténtalo/i);
  assert.equal(api.calls.some((call) => ['upload', 'insert', 'download'].includes(call.kind)), false);
  assert.equal(JSON.stringify(row), snapshot);
  assert.equal(api.rows.size, 1); assert.equal(api.objects.size, 1);
});

test('an archive racing the insert yields the same scoped 409 and never restores or changes the identity', async () => {
  const api = harness({ archiveDuringInsert: true }); const bytes = workbook();
  const response = await api.POST(uploadRequest(bytes, 'save-draft'));
  const rejected = await body(response);
  assert.equal(response.status, 409); assert.equal(rejected.code, 'DOCUMENT_ARCHIVED');
  assert.doesNotMatch(rejected.error, /reintent|inténtalo/i);
  assert.equal(api.calls.filter((call) => call.kind === 'upload' && call.bucket === 'module-documents').length, 1);
  assert.equal(api.calls.filter((call) => call.kind === 'upload' && call.bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET).length, 1);
  assert.equal(api.calls.filter((call) => call.kind === 'insert').length, 1);
  assert.equal(api.rows.size, 1); assert.equal(api.objects.size, 1);
  const row = [...api.rows.values()][0]; const snapshot = JSON.stringify(row);
  assert.equal(row.organization_id, ORG); assert.equal(row.is_active, false); assert.ok(row.deleted_at);
  api.calls.length = 0;
  assert.equal((await api.POST(uploadRequest(bytes, 'save-draft'))).status, 409);
  assert.equal(api.calls.some((call) => call.kind === 'upload' || call.kind === 'insert'), false);
  assert.equal(JSON.stringify(row), snapshot);
});

test('a deletion during an existing draft download returns 409 instead of suggesting an impossible retry', async () => {
  const options = {}; const api = harness(options); const bytes = workbook();
  const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  options.archiveDuringDownload = true;
  api.calls.length = 0;
  const response = await api.POST(uploadRequest(bytes, 'save-draft'));
  const rejected = await body(response);
  assert.equal(response.status, 409); assert.equal(rejected.code, 'DOCUMENT_ARCHIVED');
  assert.doesNotMatch(rejected.error, /reintent|inténtalo/i);
  assert.equal(api.calls.some((call) => call.kind === 'upload' || call.kind === 'insert'), false);
  assert.equal(api.calls.filter((call) => call.kind === 'download' && call.bucket === 'module-documents').length, 1);
  assert.equal(api.calls.filter((call) => call.kind === 'download' && call.bucket === manifestStorage.WORKBOOK_MANIFEST_BUCKET).length, 1);
  const row = api.rows.get(saved.document.id);
  assert.ok(row.deleted_at); assert.equal(row.is_active, false);
  assert.equal(api.rows.size, 1); assert.equal(api.objects.size, 1);
});

test('an archived row outside the organization cannot be disclosed by a deterministic identity conflict', async () => {
  const api = harness(); const bytes = workbook();
  const saved = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  const row = api.rows.get(saved.document.id);
  row.organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  row.deleted_at = '2026-10-18T18:00:00Z';
  const snapshot = JSON.stringify(row);
  const response = await api.POST(uploadRequest(bytes, 'save-draft'));
  const rejected = await body(response);
  assert.equal(response.status, 503); assert.equal(rejected.code, 'DRAFT_SAVE_INCOMPLETE');
  assert.doesNotMatch(rejected.error, /eliminad|archivad/i);
  assert.equal(JSON.stringify(row), snapshot);
});

test('version links validate predecessor identity, tenant and changed bytes without mutating the predecessor', async () => {
  const api = harness(); const bytes = workbook();
  const first = await body(await api.POST(uploadRequest(bytes, 'save-draft')));
  assert.equal((await api.POST(uploadRequest(bytes, 'save-draft', { previousVersionId: first.document.id }))).status, 409);
  const old = JSON.stringify(api.rows.get(first.document.id));
  const next = await body(await api.POST(uploadRequest(emptyValueFixture(), 'save-draft', { previousVersionId: first.document.id })));
  assert.equal(next.document.version, 2); assert.equal(next.document.previousVersionId, first.document.id);
  assert.equal(JSON.stringify(api.rows.get(first.document.id)), old);
  assert.equal((await api.POST(uploadRequest(bytes, 'save-draft', { previousVersionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }))).status, 404);
});

test('stored-original analysis admits read-only historical legacy rows but rejects deleted or foreign tenant paths', async () => {
  const api = harness({ readOnly: true, role: 'operador' }); const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; const bytes = workbook();
  const row = { id, organization_id: ORG, module: 'maintenance', category: 'legacy', document_name: 'legacy.xlsx',
    is_active: false, deleted_at: null, file_path: 'maintenance/legacy/original.xlsx', file_size_bytes: bytes.length };
  api.rows.set(id, row); api.objects.set(row.file_path, bytes);
  const response = await api.POST(sourceRequest(id));
  assert.equal(response.status, 200);
  const analyzed = await body(response);
  assert.equal(analyzed.manifest.file.sha256, digest(bytes));
  assert.equal(analyzed.capabilities.canSaveDraft, false);
  assert.match(analyzed.capabilities.reason, /solo lectura/);
  row.deleted_at = '2026-01-01T00:00:00Z';
  assert.equal((await api.POST(sourceRequest(id))).status, 404);
  row.deleted_at = null; row.file_path = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd/maintenance/original.xlsx';
  assert.equal((await api.POST(sourceRequest(id))).status, 422);
  row.organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert.equal((await api.POST(sourceRequest(id))).status, 404);
  assert.equal(api.calls.filter((call) => call.kind === 'upload' || call.kind === 'insert').length, 0);
});

test('large complete manifests use gzip; transport rejection happens before explicit persistence', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(Array.from({ length: 12000 }, () => ['evidence'])), 'All');
  const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
  const api = harness();
  const rejected = await api.POST(uploadRequest(bytes, 'save-draft', {}, false));
  assert.equal(rejected.status, 406); assert.equal((await body(rejected)).code, 'GZIP_REQUIRED');
  assert.equal(api.objects.size, 0); assert.equal(api.manifestObjects.size, 0); assert.equal(api.rows.size, 0);
  const response = await api.POST(uploadRequest(bytes));
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-encoding'), 'gzip');
  const parsed = await body(response); assert.equal(parsed.counts.cells, 12000); assert.equal(parsed.manifest.sheets[0].cells.length, 12000);
  const savedResponse = await api.POST(uploadRequest(bytes, 'save-draft'));
  assert.equal(savedResponse.status, 200); assert.equal(savedResponse.headers.get('content-encoding'), 'gzip');
  const saved = await body(savedResponse); assert.equal(saved.manifest.sheets[0].cells.length, 12000);
  const row = api.rows.get(saved.document.id); const inserted = api.calls.find((call) => call.kind === 'insert').row;
  assert.ok(Buffer.byteLength(JSON.stringify(inserted)) < 16 * 1024, 'database payload is bounded independently of cell count');
  assert.equal(JSON.stringify(inserted).includes('"sheets":['), false);
  assert.equal(JSON.stringify(inserted).includes('"cells":['), false);
  const complete = JSON.parse(gunzipSync(api.manifestObjects.get(row.extracted_data.manifestStorage.path)));
  assert.deepEqual(complete, saved.manifest, 'all cells and metadata survive full artifact storage');
});
