import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import typescript from 'typescript';

const routes = [
  'app/api/bodega/movements/route.ts',
  'app/api/bodega/movimientos/route.ts',
  'app/api/warehouse/stock/route.ts',
];
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const org = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function harness(path, { allowed = true, mismatch = false } = {}) {
  const source = readFileSync(resolve(process.cwd(), path), 'utf8');
  const calls = [];
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: path, reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics || []).filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  const mocks = {
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } } },
    '@/lib/api/module-access': {
      MODULE_KEYS: { BODEGA_INVENTARIO: 'bodega_inventario' },
      requireModuleAccess: async (_request, key, write) => {
        calls.push({ type: 'module', key, write });
        assert.equal(key, 'bodega_inventario');
        return allowed ? { authorized: true, user: { id: actor }, organizationId: org }
          : { authorized: false, response: { status: 403, body: { error: 'Sin acceso' } } };
      },
    },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => {
        calls.push({ type: 'context' });
        return { ok: true, userId: mismatch ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' : actor, organizationId: org,
          supabase: { from() { calls.push({ type: 'db' }); throw Error('Unexpected DB use'); } } };
      },
    },
    '@/lib/inventory-alerts': { isStockBelowMinimum: () => false },
  };
  runInNewContext(compiled.outputText, { module, exports: module.exports, console,
    require(name) { assert.ok(mocks[name], 'Unexpected dependency ' + name); return mocks[name]; },
  });
  return { route: module.exports, calls, source };
}

for (const path of routes) {
  test(path + ' rejects unauthorized writes before touching data', async () => {
    const x = harness(path, { allowed: false });
    assert.equal((await x.route.POST({})).status, 403);
    assert.deepEqual(x.calls.map(c => c.type), ['module']);
    assert.equal(x.calls[0].write, true);
  });
  test(path + ' denies mismatched identity or organization', async () => {
    const x = harness(path, { mismatch: true });
    assert.equal((await x.route.POST({})).status, 403);
    assert.deepEqual(x.calls.map(c => c.type), ['module','context']);
  });
  test(path + ' blocks direct non-atomic stock writes even for editors', async () => {
    const x = harness(path);
    assert.equal((await x.route.POST({})).status, 409);
    assert.deepEqual(x.calls.map(c => c.type), ['module','context']);
    const body = x.source.slice(x.source.indexOf('export async function POST'));
    for (const mutation of [/\.from\s*\(/, /\.rpc\s*\(/, /\.insert\s*\(/, /\.update\s*\(/])
      assert.doesNotMatch(body, mutation);
  });
}

test('canonical stock GET remains available', async () => {
  const x = harness(routes[2]);
  assert.equal(typeof x.route.GET, 'function');
  assert.match(x.source, /\.from\('warehouse_stock'\)/);
});
test('unscoped legacy movement history is not presented as operational stock', async () => {
  const x = harness(routes[1]);
  assert.equal((await x.route.GET({})).status, 410);
  assert.equal(x.calls[0].write, false);
});
