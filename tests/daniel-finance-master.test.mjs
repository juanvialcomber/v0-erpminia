import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/finance/sources/daniel-master/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const engineSource = readFileSync(new URL('../lib/finance/daniel-master-engine.ts', import.meta.url), 'utf8');
const engine = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(engineSource)).toString('base64'));

function loadModule(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports, require: (name) => dependencies[name] });
  return module.exports;
}

const masterSource = loadModule('../lib/finance/daniel-master-source.ts', {
  '@/lib/finance/daniel-master-engine': engine,
});
const sharedMaster = loadModule('../lib/finance/daniel-master.ts');
const masterAssistant = loadModule('../lib/finance/daniel-master-assistant.ts', {
  '@/lib/finance/daniel-master': sharedMaster,
});

function harness({ denied, documentExists = true, failTable, accessOrg = 'org-a', expectedRows = 3 } = {}) {
  const requests = [];
  const supabase = createClient('https://fixture.example', 'fixture-key', {
    global: {
      async fetch(input) {
        const url = new URL(input);
        const table = url.pathname.split('/').at(-1);
        requests.push({ table, params: url.searchParams });
        assert.equal(url.searchParams.get('organization_id'), 'eq.org-a');
        assert.match(url.searchParams.get('source_file_sha256'), /^eq\.[0-9a-f]{64}$/);
        if (failTable === table) {
          return Response.json({ message: 'Internal error' }, { status: 500 });
        }
        if (table === 'production_source_documents') {
          return Response.json(documentExists ? [{ source_file: 'Maestro.xlsx', row_count: 1191 }] : []);
        }
        if (table === 'production_source_sheet_registry') {
          return Response.json([{ source_sheet: 'EERR', nonempty_rows: expectedRows, row_level_materialized: true }]);
        }
        if (url.searchParams.has('source_sheet')) {
          assert.equal(url.searchParams.get('source_sheet'), 'eq.EERR');
          assert.equal(url.searchParams.get('domain'), 'eq.source_workbook');
          assert.equal(url.searchParams.get('record_type'), 'eq.daniel_master_raw_row');
          if (!url.searchParams.has('source_row')) {
            if (url.searchParams.get('select') === 'source_row') return Response.json([{ source_row: 28 }]);
            return Response.json([
              { source_row: 26, source_values: { cells: { E26: { value: 10 } } } },
              { source_row: 27, source_values: { cells: { E27: { value: 10 } } } },
              { source_row: 28, source_values: { cells: { E28: { formula: '=E26-E27', cached: 0 } } } },
            ]);
          }
          if (url.searchParams.get('source_row') !== 'eq.28') return Response.json([]);
          return Response.json([{ source_row: 28, source_values: { cells: { E28: { formula: '=E26-E27', cached: 0 } } } }]);
        }
        assert.equal(url.searchParams.get('domain'), 'in.(finance,production)');
        assert.equal(url.searchParams.get('record_type'), 'like.daniel\\_monthly\\_v1\\_%');
        return Response.json([{
          id: 'metric-1', domain: 'finance', period_start: '2026-07-01', source_sheet: 'EERR',
          source_row: 28, source_values: { cell_address: 'E28' },
          normalized_values: { value: 0, unit: 'CLP', metric_code: 'operating_revenue', publishable: false },
        }]);
      },
    },
  });

  const module = { exports: {} };
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/finance/daniel-master-source': masterSource,
    '@/lib/api/module-access': {
      MODULE_KEYS: { FIN_FINANZAS: 'fin_finanzas' },
      async requireModuleAccess(_request, key, write) {
        assert.equal(key, 'fin_finanzas');
        assert.equal(write, undefined);
        return denied
          ? { authorized: false, response: Response.json({}, { status: denied }) }
          : { authorized: true, organizationId: accessOrg };
      },
    },
    '@/lib/api/organization-context': {
      async getOrganizationContext() { return { ok: true, organizationId: 'org-a', supabase }; },
    },
  };
  runInNewContext(compiled, {
    module, exports: module.exports, require: (name) => dependencies[name], console: { error() {} },
  });
  const read = (query = '') => module.exports.GET({ nextUrl: new URL(`https://motil.example/api/finance/sources/daniel-master${query}`) });
  return { read, requests, source: masterSource.danielMasterSource({ organizationId: 'org-a', supabase }) };
}

test('master requires a finance session and consistent organization before consulting Supabase', async () => {
  for (const denied of [401, 403]) {
    const { read, requests } = harness({ denied });
    assert.equal((await read()).status, denied);
    assert.equal(requests.length, 0);
  }
  const { read, requests } = harness({ accessOrg: 'org-b' });
  assert.equal((await read()).status, 403);
  assert.equal(requests.length, 0);
});

test('finance master reads the reported amount and follows its exact cached formula cell', async () => {
  const { read } = harness();
  const summary = await read();
  assert.equal(summary.status, 200);
  assert.equal(summary.headers.get('cache-control'), 'private, no-store');
  const { document, metrics: [metric] } = await summary.json();
  assert.equal(document.row_count, 1191);
  assert.equal(metric.period, '2026-07-01');
  assert.equal(metric.value, 0);
  assert.equal(metric.provisional, true);

  const sheet = new URLSearchParams({ sheet: metric.sheet });
  const index = await read(`?${sheet}`);
  assert.deepEqual(await index.json(), { rows: [28] });
  sheet.set('row', String(metric.row));
  const evidence = await read(`?${sheet}`);
  assert.deepEqual((await evidence.json()).source_values.cells[metric.cell], { formula: '=E26-E27', cached: 0 });
});

test('missing or invalid source data is distinguishable from a database failure', async () => {
  const { read } = harness();
  assert.equal((await read('?row=28')).status, 400);
  assert.equal((await read('?sheet=EERR&row=0')).status, 400);
  assert.equal((await read('?sheet=EERR&row=29')).status, 404);
  const empty = await harness({ documentExists: false }).read();
  assert.deepEqual(await empty.json(), { document: null, sheets: [], metrics: [] });
  const failure = await harness({ failTable: 'production_source_normalized_records' }).read();
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: 'No se pudo consultar el maestro de Finanzas' });
});

test('calculation endpoint recomputes from persisted input cells and rejects incomplete materialization', async () => {
  const { read } = harness();
  const request = await read('?calculate=1');
  assert.equal(request.status, 200);
  assert.deepEqual((await request.json()).results['metric-1'], {
    status: 'matched', calculated: 0, difference: 0, cachedDifference: 0, formula: '=E26-E27',
  });

  const incomplete = await harness({ expectedRows: 4 }).read('?calculate=1');
  assert.deepEqual((await incomplete.json()).results['metric-1'], {
    status: 'blocked', reason: 'missing_evidence', cell: 'E28',
  });
  const denied = harness({ denied: 403 });
  assert.equal((await denied.read('?calculate=1')).status, 403);
  assert.equal(denied.requests.length, 0);
});

function evaluate(cells, metricCell, value) {
  const rows = Object.entries(cells).map(([cell, source]) => ({
    source_row: Number(cell.slice(1)),
    source_values: { cells: { [cell]: source } },
  }));
  return engine.reconcileDanielMaster([{ id: 'metric', sheet: 'EERR', cell: metricCell, value }], new Map([['EERR', rows]])).metric;
}

test('motor ignores cached intermediate values and preserves blanks, precedence and signed operands', () => {
  const result = evaluate({
    E1: { value: 4 }, E3: { value: 'texto' }, E4: { formula: '=E1*2', cached: 100 },
    E5: { formula: '=SUM($E$1:E4)+(-E1)/2', cached: 10 },
  }, 'E5', 10);
  assert.equal(result.status, 'matched');
  assert.equal(result.calculated, 10);
});

test('motor distinguishes source values, report drift and a stale saved formula result', () => {
  assert.equal(evaluate({ E1: { value: 0 } }, 'E1', 0).status, 'source_value');
  const report = evaluate({ E2: { formula: '=8+2', cached: 10 } }, 'E2', 11);
  assert.equal(report.status, 'difference');
  assert.equal(report.difference, -1);
  assert.equal(report.cachedDifference, 0);
  const cache = evaluate({ E2: { formula: '=8+2', cached: 8 } }, 'E2', 10);
  assert.equal(cache.status, 'difference');
  assert.equal(cache.difference, 0);
  assert.equal(cache.cachedDifference, 2);
});

test('motor reports invalid inputs, division by zero, circular references and unsupported syntax', () => {
  const cases = [
    [{ E1: { type: 'e', value: '#N/A' }, E2: { formula: '=E1+1' } }, 'invalid_value', 'E1'],
    [{ E2: { formula: '=E1/0' } }, 'division_by_zero', 'E2'],
    [{ E1: { formula: '=E2' }, E2: { formula: '=E1' } }, 'circular_reference', 'E2'],
    [{ E2: { formula: '=F1+1' } }, 'unsupported_formula', 'F1'],
    [{ E2: { formula: '=SUM(E9999999999999999999:E9999999999999999999)' } }, 'unsupported_formula', 'E2'],
  ];
  for (const [cells, reason, cell] of cases) {
    assert.deepEqual(evaluate(cells, 'E2', 1), { status: 'blocked', reason, cell });
  }
});

test('assistant answers July directly from the same tenant-scoped source and links the exact metric', async () => {
  const { source } = harness();
  const master = await source.read();
  const calculation = await source.calculate(master);
  const question = masterAssistant.danielMasterQuestion('¿Qué puedo dar por cerrado en julio y qué requiere mi revisión?');
  assert.ok(question);
  const reply = masterAssistant.answerDanielMaster(question, master, calculation);
  assert.match(reply.answer, /1 fórmulas coinciden/);
  assert.match(reply.answer, /1 indicadores provisionales/);
  assert.match(reply.answer, /requiere validación de Finanzas/);
  assert.match(reply.answer, /discrepancia entre la portada y el archivo/);
  assert.equal(reply.evidenceRefs[0].href, '/dashboard/finanzas/fuentes/maestro?metric=metric-1#evidencia');
  assert.equal(sharedMaster.isDanielMasterEvidenceHref(reply.evidenceRefs[0].href), true);
  assert.equal(sharedMaster.isDanielMasterEvidenceHref('https://external.example/maestro'), false);

  const detail = masterAssistant.answerDanielMaster(
    masterAssistant.danielMasterQuestion('¿Cuáles fueron los ingresos operacionales provisionales de julio de 2026?'),
    master, calculation,
  );
  assert.match(detail.answer, /EERR · E28/);
  assert.match(detail.answer, /=E26-E27/);
  assert.match(detail.answer, /Provisional/);
});

test('assistant does not use July evidence for another period or intercept inventory and treasury', async () => {
  const { source } = harness();
  const master = await source.read();
  const calculation = await source.calculate(master);
  for (const query of ['Cierre de junio en el maestro de Daniel', 'Maestro de julio de 2025', 'Maestro de Daniel 2026-09', 'Maestro de Daniel de este mes']) {
    const result = masterAssistant.answerDanielMaster(masterAssistant.danielMasterQuestion(query), master, calculation);
    assert.match(result.answer, /No puedo identificar un período/);
    assert.doesNotMatch(result.answer, /fórmulas coinciden/);
  }
  assert.ok(masterAssistant.danielMasterQuestion('¿Cuánto costó operar en julio?').codes.includes('cost_total_management'));
  assert.equal(masterAssistant.danielMasterQuestion('¿Qué pagos vencen en julio?'), null);
  assert.equal(masterAssistant.danielMasterQuestion('¿Qué stock estaba negativo en julio?'), null);
});
