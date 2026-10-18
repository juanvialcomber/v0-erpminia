import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as uuid from 'uuid';

function load(relativePath, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports, Date,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const identity = load('../lib/maintenance/workbook-evidence-identity.ts', { uuid });
const groups = load('../lib/messages/greenapi-group-scope.ts', {});
const evidence = load('../lib/maintenance/source-evidence.ts', {
  '@/lib/maintenance/workbook-evidence-identity': identity,
  '@/lib/messages/greenapi-group-scope': groups,
});

const ORG = '10000000-0000-0000-0000-000000000001';
const OTHER_ORG = '10000000-0000-0000-0000-000000000002';
const AT = '2026-10-18T14:00:00Z';
const HASH = 'b'.repeat(64);

function document(overrides = {}) {
  return {
    id: 'legacy', organization_id: ORG, module: 'mantenimiento', category: 'equipos',
    document_name: 'Ficha equipo A', document_type: 'application/pdf', document_type_category: 'Ficha de equipo',
    file_path: 'mantenimiento/equipos/ficha.pdf', file_size_bytes: 1400,
    description: 'Documento de revisión', uploaded_by: 'uploader', uploaded_at: AT,
    valid_from: AT, valid_until: '2027-10-18', version: 1, previous_version_id: null,
    status: 'draft', l1_status: null, l2_status: null, l1_observations: 'Revisar serie', l2_observations: null,
    is_active: true, deleted_at: null, created_at: AT, updated_at: AT,
    document_code: 'DOC-1', tags: ['equipo'], asset_id: 'asset-A', canonical_section: 'ficha_equipo',
    provenance_status: 'operational', canonical_role: null,
    extracted_data: { serial: 'SERIE-1', components: [{ name: 'Motor', code: 'M1' }] },
    ...overrides,
  };
}

function workbook(overrides = {}) {
  const row = document({
    id: 'native', category: 'source-workbooks', canonical_section: 'library', asset_id: null,
    document_name: 'Maestro.xlsx', document_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    document_type_category: 'Fuente Excel', file_path: `${ORG}/maintenance/source-workbooks/native/original.xlsx`,
    provenance_status: 'supporting', canonical_role: 'supporting', version: 2, previous_version_id: 'previous',
    extracted_data: {
      schemaVersion: 'motil.workbook-evidence.v1', review_status: 'unreviewed',
      manifest: {
        file: { name: 'Maestro.xlsx', extension: 'xlsx', byteLength: 1400, sha256: HASH },
        counts: { sheets: 6, hiddenSheets: 1, cells: 120, formulaCells: 45, cachedFormulaCells: 44, mergedRanges: 2, definedNames: 3, dependencies: 100 },
        get sheets() { throw new Error('Full cell manifest crossed the database boundary'); },
      },
    },
    ...overrides,
  });
  Object.defineProperty(row, 'search_text', {
    enumerable: true,
    get() { throw new Error('Large native search_text crossed the database boundary'); },
  });
  return row;
}

function setup({ rows = [], authorized = true, maintenanceAccess = true, accessOrg = ORG, failed = false, noCount = false } = {}) {
  const reads = [];
  const signed = [];
  const delegated = [];
  let guardCalls = 0;
  const supabase = {
    from(table) {
      assert.equal(table, 'module_documents');
      const read = { columns: '', filters: [], orders: [], cap: null };
      reads.push(read);
      const query = {
        select(columns) { read.columns = columns; return query; },
        eq(column, value) { read.filters.push(row => row[column] === value); return query; },
        is(column, value) { read.filters.push(row => row[column] === value); return query; },
        or(expression) {
          assert.equal(expression, 'category.is.null,category.neq.source-workbooks');
          read.filters.push(row => row.category === null || row.category !== 'source-workbooks');
          return query;
        },
        ilike(column, pattern) {
          const needle = pattern.slice(1, -1).toLowerCase();
          read.filters.push(row => String(row[column] || '').toLowerCase().includes(needle));
          return query;
        },
        order(column, options) { read.orders.push({ column, ascending: options.ascending }); return query; },
        limit(value) { assert.ok(value > 0 && value <= 1001); read.cap = value; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (failed) return { data: null, error: true, count: null };
            let matches = rows.filter(row => read.filters.every(filter => filter(row)));
            const count = matches.length;
            matches = [...matches].sort((a, b) => {
              for (const order of read.orders) {
                const delta = String(a[order.column]).localeCompare(String(b[order.column])) * (order.ascending ? 1 : -1);
                if (delta) return delta;
              }
              return 0;
            });
            if (read.cap !== null) matches = matches.slice(0, read.cap);
            const data = matches.map(row => {
              if (read.columns === '*') return JSON.parse(JSON.stringify(row));
              return Object.fromEntries(read.columns.split(',').map(column => {
                const [alias, expression = alias] = column.split(':');
                const path = expression.split('->');
                let value = row[path[0]];
                for (const segment of path.slice(1)) value = value?.[segment.replace(/^>/, '')];
                if (path.at(-1).startsWith('>') && value !== null && value !== undefined) value = String(value);
                return [alias, value === undefined ? null : JSON.parse(JSON.stringify(value))];
              }));
            });
            return { data, count: noCount ? null : count, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'module-documents');
        return { async createSignedUrl(path, expiresIn) {
          signed.push({ path, expiresIn });
          return { data: { signedUrl: `https://storage.example.test/${path}?signed=fixture` }, error: null };
        } };
      },
    },
  };
  const { GET } = load('../app/api/documents/list/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/api/auth-session': { resolveAuthContext: async () => authorized ? { organizationId: ORG, user: { id: 'reader' } } : null },
    '@/lib/supabase-server': { getSupabaseServerClient: () => supabase },
    '@/lib/api/module-access': {
      MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones' },
      requireModuleAccess: async (_request, key) => {
        assert.equal(key, 'mant_operaciones');
        guardCalls++;
        return maintenanceAccess ? { authorized: true, organizationId: accessOrg }
          : { authorized: false, response: Response.json({ error: 'Sin permisos' }, { status: 403 }) };
      },
    },
    '@/lib/maintenance/source-evidence': evidence,
    '@/lib/api/documents': { listDocumentsForOrganization: async (organizationId, options) => {
      delegated.push({ organizationId, options });
      return { documents: [{ id: 'canonical' }], total: 1 };
    } },
  });
  return { reads, signed, delegated, guardCalls: () => guardCalls, get: query => GET({ nextUrl: new URL(`https://motil.example.test/api/documents/list${query}`) }) };
}

test('mixed maintenance list preserves legacy extraction and returns a native outline without reading its full manifest', async () => {
  const legacy = document();
  const c = setup({ rows: [legacy, workbook()] });
  const response = await c.get('?module=mantenimiento');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.documents.length, 2);
  const old = body.documents.find(row => row.id === 'legacy');
  assert.deepEqual(old.extracted_data, legacy.extracted_data);
  assert.equal(old.canonical_section, legacy.canonical_section);
  assert.equal(old.asset_id, legacy.asset_id);
  const native = body.documents.find(row => row.id === 'native');
  assert.equal(native.extracted_data.summaryOnly, true);
  assert.equal(native.extracted_data.manifest.file.sha256, HASH);
  assert.deepEqual(native.extracted_data.manifest.counts, { sheets: 6, hiddenSheets: 1, cells: 120, formulaCells: 45, cachedFormulaCells: 44, mergedRanges: 2, definedNames: 3, dependencies: 100 });
  assert.equal(native.extracted_data.manifest.sheets, undefined);
  for (const field of ['document_type_category', 'uploaded_at', 'valid_until', 'version', 'previous_version_id', 'l1_observations', 'tags', 'canonical_role'])
    assert.deepEqual(native[field], workbook()[field], field);
  assert.ok(native.file_url);
  assert.ok(JSON.stringify(body).length < 12000);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('equipment-only consumer retains exact extracted data and never needs the new source permission', async () => {
  const selected = document();
  const c = setup({ maintenanceAccess: false, rows: [selected, document({ id: 'other-asset', asset_id: 'asset-B' }), workbook()] });
  const body = await (await c.get('?module=mantenimiento&category=equipos&assetId=asset-A')).json();
  assert.equal(body.documents.length, 1);
  assert.deepEqual(body.documents[0].extracted_data, selected.extracted_data);
  assert.equal(c.reads.length, 1);
  assert.equal(c.guardCalls(), 0);
});

test('both query branches obey tenant, module, status, asset, section, search, active and soft-delete filters', async () => {
  const matching = { status: 'pending_l1', asset_id: 'asset-A', canonical_section: 'ficha_equipo', document_name: 'Revisión equipo A' };
  const rejectedVariants = [
    { organization_id: OTHER_ORG }, { module: 'legal' }, { status: 'active' }, { asset_id: 'asset-B' },
    { canonical_section: 'evidencia' }, { document_name: 'Otro documento' }, { is_active: false }, { deleted_at: AT },
  ];
  const rows = [document(matching), workbook(matching)];
  rejectedVariants.forEach((variant, index) => {
    rows.push(document({ ...matching, ...variant, id: `old-${index}` }));
    rows.push(workbook({ ...matching, ...variant, id: `new-${index}` }));
  });
  const c = setup({ rows });
  const body = await (await c.get(`?module=mantenimiento&status=pending_l1&assetId=asset-A&canonicalSection=ficha_equipo&search=equipo%20A&organization_id=${OTHER_ORG}`)).json();
  assert.deepEqual(new Set(body.documents.map(row => row.id)), new Set(['legacy', 'native']));
  assert.equal(c.signed.length, 2);
});

test('native permission is required explicitly and mixed legacy listing cannot expose or sign a source workbook', async () => {
  for (const options of [{ maintenanceAccess: false }, { accessOrg: OTHER_ORG }]) {
    const explicit = setup({ ...options, rows: [workbook()] });
    assert.equal((await explicit.get('?module=mantenimiento&category=source-workbooks')).status, 403);
    assert.equal(explicit.reads.length, 0);
    assert.equal(explicit.signed.length, 0);
    const mixed = setup({ ...options, rows: [document(), workbook()] });
    const body = await (await mixed.get('?module=mantenimiento')).json();
    assert.deepEqual(body.documents.map(row => row.id), ['legacy']);
    assert.equal(mixed.reads.length, 1);
    assert.equal(mixed.signed.length, 1);
    assert.equal(body.total, 1);
  }
});

test('native lookup handles null-category legacy documents and avoids signing another tenant object path', async () => {
  const c = setup({ rows: [document({ category: null }), workbook({ file_path: `${OTHER_ORG}/private.xlsx` })] });
  const body = await (await c.get('?module=mantenimiento')).json();
  assert.equal(body.documents.length, 2);
  assert.equal(body.documents.find(row => row.id === 'native').file_url, null);
  assert.equal(c.signed.length, 1);
  const nativeOnly = setup({ rows: [document(), workbook()] });
  const selected = await (await nativeOnly.get('?module=mantenimiento&category=source-workbooks')).json();
  assert.deepEqual(selected.documents.map(row => row.id), ['native']);
  assert.equal(nativeOnly.reads.length, 1);
});

test('merged output is stable across both sources, bounded and explicit about its total', async () => {
  const rows = Array.from({ length: 1004 }, (_, i) => {
    const id = String(i).padStart(5, '0');
    return i % 2 ? workbook({ id }) : document({ id });
  });
  const c = setup({ rows });
  const body = await (await c.get('?module=mantenimiento')).json();
  assert.equal(body.documents.length, 1000);
  assert.equal(body.total, 1004);
  assert.equal(body.truncated, true);
  assert.equal(body.documents[0].id, '01003');
  assert.equal(body.documents.at(-1).id, '00004');
  assert.equal(c.signed.length, 1000);
});

test('a capped source retains the exact server total and never substitutes its capped row count for an unknown total', async () => {
  const rows = Array.from({ length: 1004 }, (_, index) => workbook({ id: String(index).padStart(5, '0') }));
  const c = setup({ rows });
  const body = await (await c.get('?module=mantenimiento&category=source-workbooks')).json();
  assert.equal(c.reads.length, 1);
  assert.equal(c.reads[0].cap, 1001);
  assert.equal(body.documents.length, 1000);
  assert.equal(body.total, 1004);
  assert.equal(body.truncated, true);
  const unknown = setup({ rows, noCount: true });
  const missingCount = await (await unknown.get('?module=mantenimiento&category=source-workbooks')).json();
  assert.equal(missingCount.total, null);
  assert.equal(missingCount.truncated, true);
});

test('legacy documents in other modules retain their extraction and the canonical no-module service stays compatible', async () => {
  const legal = document({ id: 'legal', module: 'legal', file_path: 'legal/documents/legal.pdf' });
  const c = setup({ rows: [document(), workbook(), legal] });
  const body = await (await c.get('?module=legal')).json();
  assert.equal(c.guardCalls(), 0);
  assert.deepEqual(body.documents.map(row => row.id), ['legal']);
  assert.deepEqual(body.documents[0].extracted_data, legal.extracted_data);
  const canonical = setup();
  const genericBody = await (await canonical.get('?status=active&category=manual&search=motor&limit=7&offset=14')).json();
  assert.deepEqual(genericBody, { documents: [{ id: 'canonical' }], total: 1 });
  assert.equal(canonical.reads.length, 0);
  assert.equal(canonical.guardCalls(), 0);
  assert.equal(canonical.delegated[0].organizationId, ORG);
  assert.deepEqual(JSON.parse(JSON.stringify(canonical.delegated[0].options)), { status: 'active', category: 'manual', search: 'motor', limit: 7, offset: 14 });
});

test('unauthenticated and failed reads return errors without creating file capabilities', async () => {
  const denied = setup({ authorized: false, rows: [document(), workbook()] });
  assert.equal((await denied.get('?module=mantenimiento')).status, 401);
  assert.equal(denied.reads.length, 0);
  assert.equal(denied.guardCalls(), 0);
  assert.equal(denied.signed.length, 0);
  const failed = setup({ failed: true });
  assert.equal((await failed.get('?module=mantenimiento')).status, 500);
  assert.equal(failed.signed.length, 0);
});
