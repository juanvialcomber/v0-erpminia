import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as uuid from 'uuid';

function compile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function execute(compiled, dependencies = {}, env = {}) {
  const exports = {};
  runInNewContext(compiled, {
    exports, Date, process: { env },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const groupScope = execute(compile('../lib/messages/greenapi-group-scope.ts'));
const identity = execute(compile('../lib/maintenance/workbook-evidence-identity.ts'), { uuid });
const evidence = execute(compile('../lib/maintenance/source-evidence.ts'), {
  '@/lib/messages/greenapi-group-scope': groupScope,
  '@/lib/maintenance/workbook-evidence-identity': identity,
});
const catalogueCode = compile('../app/api/maintenance/source-evidence/route.ts');
const originCode = compile('../app/api/maintenance/source-evidence/[sourceType]/[id]/origin/route.ts');

const ORG = '10000000-0000-0000-0000-000000000001';
const OTHER_ORG = '10000000-0000-0000-0000-000000000002';
const IMPORT_ID = '20000000-0000-0000-0000-000000000001';
const DOCUMENT_ID = '30000000-0000-0000-0000-000000000001';
const ATTACHMENT_ID = '40000000-0000-0000-0000-000000000001';
const GROUP_ID = '50000000-0000-0000-0000-000000000001';
const DISABLED_GROUP = '50000000-0000-0000-0000-000000000002';
const EXCLUDED_GROUP = '50000000-0000-0000-0000-000000000003';
const UNLISTED_GROUP = '50000000-0000-0000-0000-000000000004';
const HASH = 'a'.repeat(64);
const AT = '2026-10-18T14:00:00Z';

function imported(overrides = {}) {
  return { id: IMPORT_ID, organization_id: ORG, source_file: 'nuevo_maestro_v11_dj09sep.xlsx',
    source_file_sha256: HASH, source_owner: 'Ariel López', source_role: 'Planificación',
    source_sheet: 'ProgramaMaestro', imported_at: AT, status: 'review_required', notes: null, ...overrides };
}

function document(overrides = {}) {
  return { id: DOCUMENT_ID, organization_id: ORG, module: 'mantenimiento', category: 'equipos', canonical_role: null, provenance_status: 'operational', document_name: 'Pauta MP250.docx',
    document_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file_path: 'mantenimiento/equipos/pauta.docx', file_size_bytes: 1400, version: 2, previous_version_id: null,
    created_at: AT, uploaded_by: 'uploader', status: 'draft', is_active: true, deleted_at: null, asset_id: null,
    canonical_section: 'pendiente_clasificar', l1_status: null, l2_status: null,
    reviewed_by_l1: null, reviewed_by_l2: null, reviewed_at_l1: null, reviewed_at_l2: null,
    extracted_data: {}, ...overrides };
}

function attachment(overrides = {}) {
  return { id: ATTACHMENT_ID, organization_id: ORG, group_id: GROUP_ID, message_id: 71,
    original_file_name: 'MP250.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: 1400, sha256: HASH, storage_path: `${ORG}/${GROUP_ID}/original.xlsx`,
    download_status: 'stored', scan_status: 'manual', extraction_json: {}, extraction_partial: null, created_at: AT, ...overrides };
}

function message(overrides = {}) {
  return { id: 71, organization_id: ORG, group_id: GROUP_ID, sender_name: 'Ariel López',
    file_name: 'MP250.xlsx', occurred_at: AT, received_at: AT, ...overrides };
}

function group(overrides = {}) {
  return { id: GROUP_ID, organization_id: ORG, chat_id: '123456789@g.us', display_name: 'Fuente autorizada', enabled: true, ...overrides };
}

function workbookDocument(overrides = {}) {
  const id = identity.workbookEvidenceDocumentId(ORG, HASH);
  return document({
    id, category: 'source-workbooks', canonical_section: 'library', canonical_role: 'supporting', provenance_status: 'supporting',
    file_path: identity.workbookEvidenceStoragePath(ORG, id, 'xlsx'), version: 1,
    document_name: 'Título editable',
    extracted_data: {
      schemaVersion: 'motil.workbook-evidence.v1',
      manifest: {
        schemaVersion: 'motil.workbook-evidence.v1',
        file: { name: 'Maestro original.xlsx', extension: 'xlsx', byteLength: 1400, sha256: HASH },
        counts: { sheets: 6, cells: 120, formulaCells: 45 },
        get sheets() { throw new Error('The catalogue must never transfer the native cell manifest'); },
      },
    },
    ...overrides,
  });
}

// These tests execute the actual handlers. Query fixtures enforce filters and
// projections; no client, network, writes or storage upload are available.
function setup({ tables = {}, configured = '', denied = null, organizationId = ORG,
  accessOrganizationId = organizationId, failedTables = [], throwingTables = [], signedError = false } = {}) {
  const reads = [];
  const signed = [];
  let contextReads = 0;
  const defaults = {
    planning_maintenance_source_imports: [], module_documents: [], motil_whatsapp_groups: [],
    motil_whatsapp_attachments: [], motil_whatsapp_messages: [],
  };
  const db = {
    from(table) {
      assert.ok(Object.hasOwn(defaults, table), `Unexpected table: ${table}`);
      const ordinal = reads.filter(read => read.table === table).length + 1;
      const read = { table, filters: [], limit: null, columns: null, orders: [] };
      reads.push(read);
      const query = {
        select(columns) { read.columns = columns.split(','); return query; },
        eq(column, value) { read.filters.push({ column, values: [value] }); return query; },
        is(column, value) { read.filters.push({ column, values: [value] }); return query; },
        in(column, values) { read.filters.push({ column, values }); return query; },
        order(column, options) { read.orders.push({ column, ascending: options.ascending }); return query; },
        limit(value) { assert.ok(value > 0 && value <= 201); read.limit = value; return query; },
        async maybeSingle() {
          const result = await resultForRead();
          return { ...result, data: result.data?.[0] || null };
        },
        then(resolve, reject) { return resultForRead().then(resolve, reject); },
      };
      async function resultForRead() {
        if (throwingTables.includes(table)) throw new Error('private database detail');
        if (failedTables.includes(table)) return { data: null, error: { message: 'private database detail' }, count: null };
        const input = typeof tables[table] === 'function' ? tables[table](ordinal) : tables[table] || defaults[table];
        let rows = input.filter(row => read.filters.every(filter => filter.values.some(value => String(row[filter.column]) === String(value))));
        const count = rows.length;
        if (read.orders.length) rows = [...rows].sort((a, b) => {
          for (const order of read.orders) {
            const difference = String(a[order.column]).localeCompare(String(b[order.column])) * (order.ascending ? 1 : -1);
            if (difference) return difference;
          }
          return 0;
        });
        if (read.limit !== null) rows = rows.slice(0, read.limit);
        if (read.columns) rows = rows.map(row => Object.fromEntries(read.columns.map(column => {
          const [alias, expression = alias] = column.split(':');
          const segments = expression.split('->');
          let value = row[segments[0]];
          for (const segment of segments.slice(1)) value = value?.[segment.replace(/^>/, '')];
          if (segments.at(-1).startsWith('>') && value !== undefined && value !== null) value = String(value);
          // Simulate serialization on the database boundary. Selecting a full
          // manifest below would read its guarded large cells and fail.
          return [alias, value === undefined ? null : JSON.parse(JSON.stringify(value))];
        })));
        return { data: rows, error: null, count };
      }
      return query;
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path, expiry) {
            signed.push({ bucket, path, expiry });
            return signedError ? { data: null, error: true } : { data: { signedUrl: `https://storage.example.test/${bucket}/${path}?token=fixture` }, error: null };
          },
        };
      },
    },
  };
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (data, init) => Response.json(data, init),
        redirect: url => new Response(null, { status: 307, headers: { Location: url } }),
      },
    },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => { contextReads++; return { ok: true, organizationId, userId: 'reader', supabase: db }; },
    },
    '@/lib/api/module-access': {
      MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones' },
      requireModuleAccess: async (_request, moduleKey) => {
        assert.equal(moduleKey, 'mant_operaciones');
        return denied ? { authorized: false, response: Response.json({ error: 'No autorizado' }, { status: denied }) }
          : { authorized: true, organizationId: accessOrganizationId };
      },
    },
    '@/lib/maintenance/source-evidence': evidence,
  };
  const env = { MAINTENANCE_SOURCE_GROUP_IDS: configured };
  const catalogue = execute(catalogueCode, dependencies, env).GET;
  const original = execute(originCode, dependencies, env).GET;
  return {
    reads, signed, contextReads: () => contextReads,
    catalogue: (query = '') => catalogue({ nextUrl: new URL(`https://motil.example.test/api/maintenance/source-evidence${query}`) }),
    original: (sourceType, id, accept = 'application/json') => original({ headers: new Headers({ Accept: accept }) }, { params: Promise.resolve({ sourceType, id }) }),
  };
}

test('historical import preserves sender and uncertain hash without inventing an original, reviewer, version or unit', () => {
  const row = evidence.projectPlanningEvidence(imported());
  assert.equal(row.sender.name, 'Ariel López');
  assert.equal(row.reviewer, null);
  assert.equal(row.integrity.kind, 'unverified');
  assert.equal(row.integrity.value, HASH);
  assert.equal(row.version, null, 'v11 in a filename is not an independently recorded version');
  assert.equal(row.original.status, 'missing');
  assert.equal(row.original.url, null);
  assert.equal(row.locator.sheet, 'ProgramaMaestro');
  assert.equal(row.extraction.status, 'partial');
  assert.equal(row.review.status, 'pending');
  assert.equal(row.interval, null);
  assert.equal(evidence.projectPlanningEvidence(imported({ status: 'canonical' })).review.status, 'unknown');
});

test('human review is independent of upload, extraction and asset linkage and requires actor plus date', () => {
  const active = evidence.projectModuleDocumentEvidence(document({ status: 'active', asset_id: 'asset', extracted_data: { review_status: 'approved', family: 'Compresores', interval: 250 } }));
  assert.equal(active.review.status, 'unknown');
  assert.equal(active.reviewer, null);
  assert.equal(active.applicability.status, 'linked');
  assert.equal(active.interval, null);
  assert.equal(active.sender.id, 'uploader');
  const l1 = document({ l1_status: 'approved', reviewed_by_l1: 'reviewer1', reviewed_at_l1: AT });
  assert.equal(evidence.projectModuleDocumentEvidence(l1).review.status, 'pending');
  const l2 = evidence.projectModuleDocumentEvidence({ ...l1, l2_status: 'approved', reviewed_by_l2: 'reviewer2', reviewed_at_l2: AT });
  assert.equal(l2.review.status, 'approved');
  assert.equal(l2.reviewer.id, 'reviewer2');
  assert.equal(l2.sender.id, 'uploader');
  assert.equal(l2.applicability.status, 'unverified');
  const rejected = evidence.projectModuleDocumentEvidence({ ...l1, l2_status: 'rejected', reviewed_by_l2: 'reviewer2', reviewed_at_l2: AT });
  assert.equal(rejected.review.status, 'rejected');
});

test('WhatsApp review-ready and partial extraction remain unapproved and never infer hours from a filename', () => {
  const row = evidence.projectWhatsappEvidence(attachment({ scan_status: 'review_ready', extraction_partial: true, extraction_json: { partial_due_to_limits: true, review_status: 'approved', transcription: 'private full transcription' } }), message());
  assert.equal(row.integrity.kind, 'binary_sha256');
  assert.equal(row.extraction.status, 'partial');
  assert.equal(row.review.status, 'pending');
  assert.equal(row.reviewer, null);
  assert.equal(row.interval, null);
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes('private full transcription'), false);
  assert.equal(serialized.includes(attachment().storage_path), false);
  assert.equal(evidence.projectWhatsappEvidence(attachment(), message()).extraction.status, 'manual_required');
});

test('catalogue restricts every source and joined message to tenant, module and explicit active group allowlist', async () => {
  const c = setup({ configured: [GROUP_ID, DISABLED_GROUP, EXCLUDED_GROUP].join(','), tables: {
    planning_maintenance_source_imports: [imported(), imported({ id: 'other-import', organization_id: OTHER_ORG })],
    module_documents: [document(), document({ id: 'other-document', organization_id: OTHER_ORG }), document({ id: 'legal-document', module: 'legal' })],
    motil_whatsapp_groups: [group(), group({ id: DISABLED_GROUP, enabled: false }), group({ id: EXCLUDED_GROUP, chat_id: '120363427917216825@g.us' }), group({ id: UNLISTED_GROUP })],
    motil_whatsapp_attachments: [attachment(), attachment({ id: 'other-tenant', organization_id: OTHER_ORG }), attachment({ id: 'disabled', group_id: DISABLED_GROUP }), attachment({ id: 'excluded', group_id: EXCLUDED_GROUP }), attachment({ id: 'unlisted', group_id: UNLISTED_GROUP })],
    motil_whatsapp_messages: [message(), message({ organization_id: OTHER_ORG })],
  } });
  const response = await c.catalogue(`?organization_id=${OTHER_ORG}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(new Set(body.data.map(row => row.sourceId)), new Set([IMPORT_ID, DOCUMENT_ID, ATTACHMENT_ID]));
  assert.equal(body.summary.loaded, 3);
  assert.equal(body.summary.originalsAvailable, 2);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(c.signed.length, 0, 'Listing metadata does not mint links for every original');
  for (const read of c.reads) assert.ok(read.filters.some(filter => filter.column === 'organization_id' && filter.values[0] === ORG), read.table);
});

test('empty WhatsApp allowlist reads no group, message or attachment regardless of group names', async () => {
  const c = setup({ tables: { motil_whatsapp_groups: [group({ display_name: 'Mantenimiento MOTIL' })], motil_whatsapp_attachments: [attachment()] } });
  const body = await (await c.catalogue()).json();
  assert.equal(body.data.length, 0);
  assert.equal(body.availability.sources.whatsapp_attachment.total, 0);
  assert.ok(body.availability.sources.whatsapp_attachment.reason);
  assert.ok(c.reads.every(read => !read.table.startsWith('motil_whatsapp_')));
});

test('server filters act on an explicitly bounded cut and retain total and truncation evidence', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => imported({ id: String(i), source_file: `Archivo ${i}.xlsx`, imported_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
  const c = setup({ tables: { planning_maintenance_source_imports: rows } });
  const body = await (await c.catalogue('?q=Archivo%20204&sourceType=planning_import&review=pending')).json();
  assert.equal(body.summary.loaded, 200);
  assert.equal(body.summary.matched, 1);
  assert.equal(body.data[0].fileName, 'Archivo 204.xlsx');
  assert.equal(body.availability.status, 'partial');
  assert.equal(body.availability.sources.planning_import.total, 205);
  assert.equal(body.availability.sources.planning_import.status, 'truncated');
  assert.ok(body.availability.warnings.some(warning => warning.includes('filtros')));
  const outsideCut = await (await c.catalogue('?q=Archivo%200.xlsx')).json();
  assert.equal(outsideCut.data.length, 0);
  assert.equal(outsideCut.availability.sources.planning_import.status, 'truncated');
  const invalid = setup();
  assert.equal((await invalid.catalogue('?sourceType=all-tenants')).status, 400);
  assert.equal((await invalid.catalogue('?review=auto-approved')).status, 400);
  assert.equal(invalid.reads.length, 0);
});

test('partial query failure preserves usable sources and total failure remains an explicit error', async () => {
  const partial = setup({ tables: { planning_maintenance_source_imports: [imported()] }, failedTables: ['module_documents'] });
  const body = await (await partial.catalogue()).json();
  assert.equal(body.data.length, 1);
  assert.equal(body.availability.status, 'partial');
  assert.equal(body.availability.sources.module_document.status, 'unavailable');
  assert.equal(JSON.stringify(body).includes('private database detail'), false);
  const unavailable = setup({ throwingTables: ['module_documents', 'planning_maintenance_source_imports'] });
  const response = await unavailable.catalogue();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).availability.status, 'unavailable');
});

test('a group disabled between source reads removes its attachments and makes coverage partial', async () => {
  const c = setup({ configured: GROUP_ID, tables: {
    motil_whatsapp_groups: ordinal => [group({ enabled: ordinal === 1 })],
    motil_whatsapp_attachments: [attachment()], motil_whatsapp_messages: [message()],
  } });
  const body = await (await c.catalogue()).json();
  assert.equal(body.data.length, 0);
  assert.equal(body.availability.status, 'partial');
  assert.ok(body.availability.warnings.some(warning => warning.includes('omitieron')));
});

test('both handlers deny unauthenticated, unauthorized and conflicting tenant contexts before any source or signing access', async () => {
  for (const options of [{ denied: 401 }, { denied: 403 }, { accessOrganizationId: OTHER_ORG }]) {
    const c = setup(options);
    const expected = options.denied || 403;
    assert.equal((await c.catalogue()).status, expected);
    assert.equal((await c.original('module_document', DOCUMENT_ID)).status, expected);
    assert.equal(c.reads.length, 0);
    assert.equal(c.signed.length, 0);
    if (options.denied) assert.equal(c.contextReads(), 0);
  }
});

test('original lookup rejects other tenants, other modules, missing files and unsafe paths without signing', async () => {
  for (const row of [
    document({ organization_id: OTHER_ORG }), document({ module: 'legal' }), document({ file_path: null }), document({ deleted_at: AT }),
    document({ file_path: `${OTHER_ORG}/private.pdf` }), document({ file_path: 'https://external.example.test/file.pdf' }),
    document({ file_path: 'mantenimiento/../legal/private.pdf' }), document({ file_path: 'mantenimiento/%2e%2e/private.pdf' }),
  ]) {
    const c = setup({ tables: { module_documents: [row] } });
    assert.equal((await c.original('module_document', DOCUMENT_ID)).status, 404);
    assert.equal(c.signed.length, 0);
  }
  const importedOnly = setup({ tables: { planning_maintenance_source_imports: [imported()] } });
  assert.equal((await importedOnly.original('planning_import', IMPORT_ID)).status, 404);
  assert.equal(importedOnly.signed.length, 0);
});

test('a valid document version opens through a short-lived signed URL and surfaces storage failure', async () => {
  const c = setup({ tables: { module_documents: [document({ is_active: false })] } });
  const response = await c.original('module_document', DOCUMENT_ID);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.expiresIn, 120);
  assert.equal(body.url, `https://storage.example.test/module-documents/mantenimiento/equipos/pauta.docx?token=fixture`);
  assert.deepEqual(c.signed, [{ bucket: 'module-documents', path: 'mantenimiento/equipos/pauta.docx', expiry: 120 }]);
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  const redirect = await c.original('module_document', DOCUMENT_ID, 'text/html');
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get('Location'), body.url);
  const failed = setup({ tables: { module_documents: [document()] }, signedError: true });
  assert.equal((await failed.original('module_document', DOCUMENT_ID)).status, 503);
});

test('WhatsApp original requires explicit scope, active non-excluded group and tenant-matched original message', async () => {
  const invalidCases = [
    { configured: '', groups: [group()], messages: [message()], file: attachment() },
    { configured: GROUP_ID, groups: [group({ enabled: false })], messages: [message()], file: attachment() },
    { configured: GROUP_ID, groups: [group({ chat_id: '120363427917216825@g.us' })], messages: [message()], file: attachment() },
    { configured: GROUP_ID, groups: [group()], messages: [message({ organization_id: OTHER_ORG })], file: attachment() },
    { configured: GROUP_ID, groups: [group()], messages: [message({ group_id: UNLISTED_GROUP })], file: attachment() },
    { configured: GROUP_ID, groups: [group()], messages: [message()], file: attachment({ organization_id: OTHER_ORG }) },
    { configured: GROUP_ID, groups: [group()], messages: [message()], file: attachment({ storage_path: `${OTHER_ORG}/foreign.xlsx` }) },
    { configured: GROUP_ID, groups: [group()], messages: [message()], file: attachment({ download_status: 'pending' }) },
  ];
  for (const item of invalidCases) {
    const c = setup({ configured: item.configured, tables: { motil_whatsapp_groups: item.groups, motil_whatsapp_messages: item.messages, motil_whatsapp_attachments: [item.file] } });
    assert.equal((await c.original('whatsapp_attachment', ATTACHMENT_ID)).status, 404);
    assert.equal(c.signed.length, 0);
  }
  const c = setup({ configured: GROUP_ID, tables: { motil_whatsapp_groups: [group()], motil_whatsapp_messages: [message()], motil_whatsapp_attachments: [attachment()] } });
  assert.equal((await c.original('whatsapp_attachment', ATTACHMENT_ID)).status, 200);
  assert.deepEqual(c.signed, [{ bucket: 'motil-whatsapp-evidence', path: attachment().storage_path, expiry: 120 }]);
});

test('versions sharing a filename remain distinct records and carry their recorded lineage', async () => {
  const previous = '30000000-0000-0000-0000-000000000002';
  const c = setup({ tables: { module_documents: [document({ previous_version_id: previous }), document({ id: previous, version: 1, is_active: false })] } });
  const body = await (await c.catalogue()).json();
  assert.equal(body.data.length, 2);
  assert.equal(body.data.find(row => row.sourceId === DOCUMENT_ID).previousVersionId, previous);
  assert.deepEqual(new Set(body.data.map(row => row.version)), new Set(['1', '2']));
});

test('native workbook identity exposes byte hash and coverage without transferring the cell manifest', async () => {
  const row = workbookDocument();
  const c = setup({ tables: { module_documents: [row] } });
  const response = await c.catalogue();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.length, 1);
  const source = body.data[0];
  assert.equal(source.fileName, 'Maestro original.xlsx');
  assert.equal(source.integrity.kind, 'binary_sha256');
  assert.equal(source.integrity.value, HASH);
  assert.equal(source.extraction.status, 'extracted');
  assert.equal(source.review.status, 'pending');
  assert.equal(source.applicability.status, 'unverified');
  assert.deepEqual(source.workbookEvidence, { sheets: 6, cells: 120, formulaCells: 45, eligiblePreviousVersion: true });
  assert.equal(source.original.status, 'available');
  assert.ok(JSON.stringify(body).length < 8000, 'A catalogue record stays bounded regardless of native manifest size');
});

test('free-form schema or hash claims cannot masquerade as a trusted workbook intake', async () => {
  for (const change of [
    { id: DOCUMENT_ID }, { file_path: 'mantenimiento/equipos/upload.xlsx' },
    { file_size_bytes: 999 }, { canonical_role: 'canonical' }, { provenance_status: 'operational' },
  ]) {
    const c = setup({ tables: { module_documents: [workbookDocument(change)] } });
    const body = await (await c.catalogue()).json();
    assert.equal(body.data[0].integrity.kind, 'unknown');
    assert.equal(body.data[0].workbookEvidence, null);
    assert.equal(body.data[0].fileName, 'Título editable');
  }
});

test('native predecessor eligibility follows active, non-deleted records and safe version integers', async () => {
  for (const change of [{ is_active: false }, { version: 2147483647 }, { version: '2' }, { version: 0 }]) {
    const c = setup({ tables: { module_documents: [workbookDocument(change)] } });
    const body = await (await c.catalogue()).json();
    assert.equal(body.data[0].integrity.kind, 'binary_sha256');
    assert.equal(body.data[0].workbookEvidence.eligiblePreviousVersion, false);
  }
  const deleted = setup({ tables: { module_documents: [workbookDocument({ deleted_at: AT })] } });
  assert.equal((await (await deleted.catalogue()).json()).data.length, 0);
});
