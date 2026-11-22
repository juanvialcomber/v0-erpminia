import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import typescript from 'typescript';

const ORG = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const WORK_ORDER = '22222222-2222-4222-8222-222222222222';
const code = readFileSync(resolve(process.cwd(), 'app/api/maintenance/work-orders/[id]/issue-materials/route.ts'), 'utf8');

function makeCase({ permission = 'ED', authUser = ACTOR, contextUser = ACTOR, accessOrg = ORG, contextOrg = ORG, historical = false } = {}) {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { work_order_id: WORK_ORDER, lines_issued: 1 }, error: null };
    },
  };
  const module = { exports: {} };
  const js = typescript.transpileModule(code, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'issue-materials.ts',
    reportDiagnostics: true,
  });
  assert.equal((js.diagnostics || []).filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);

  const modules = {
    'next/server': {
      NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } },
    },
    '@/lib/api/module-access': {
      MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones' },
      requireModuleAccess: async (_request, key, write) => {
        assert.equal(key, 'mant_operaciones');
        assert.equal(write, true);
        return permission === 'ED'
          ? { authorized: true, canWrite: true, user: { id: authUser }, organizationId: accessOrg }
          : { authorized: false, response: { status: permission === 'SR' ? 401 : 403 } };
      },
    },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => ({ ok: true, userId: contextUser, organizationId: contextOrg, supabase }),
    },
    '@/lib/maintenance/work-order-scope': {
      requireOperationalMaintenanceWorkOrder: async (_db, organizationId, id) => {
        calls.push({ name: 'scope', args: { organizationId, id } });
        return historical
          ? { ok: false, status: 409, error: 'OT histórica', scope: 'historical' }
          : { ok: true, scope: 'operational' };
      },
    },
  };
  runInNewContext(js.outputText, {
    module,
    exports: module.exports,
    require(name) {
      if (!modules[name]) throw new Error('Unexpected module: ' + name);
      return modules[name];
    },
    console,
  }, { filename: 'issue-materials.js' });
  const request = {};
  const routeContext = { params: Promise.resolve({ id: WORK_ORDER }) };
  return { run: () => module.exports.POST(request, routeContext), calls };
}

test('maintenance editor reaches the stock-issue RPC only for an operational OT in own organization', async () => {
  const t = makeCase();
  const result = await t.run();
  assert.equal(result.status, 200);
  assert.equal(result.body.lines_issued, 1);
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[0].name, 'scope');
  assert.equal(t.calls[0].args.organizationId, ORG);
  assert.equal(t.calls[1].name, 'issue_available_materials_to_work_order');
  assert.equal(t.calls[1].args.p_work_order_id, WORK_ORDER);
});

test('read-only and missing maintenance access never issue or mutate stock', async () => {
  for (const permission of ['LEC', 'SR']) {
    const t = makeCase({ permission });
    const result = await t.run();
    assert.equal(result.status, permission === 'LEC' ? 403 : 401);
    assert.equal(t.calls.length, 0);
  }
});

test('session/tenant mismatch fails before the stock RPC', async () => {
  for (const mismatch of [
    { contextUser: '33333333-3333-4333-8333-333333333333' },
    { contextOrg: '44444444-4444-4444-8444-444444444444' },
  ]) {
    const t = makeCase(mismatch);
    const result = await t.run();
    assert.equal(result.status, 403);
    assert.equal(t.calls.length, 0);
  }
});

test('an imported historical OT stays read-only even for a maintenance editor', async () => {
  const t = makeCase({ historical: true });
  const result = await t.run();
  assert.equal(result.status, 409);
  assert.equal(t.calls.some((row) => row.name === 'issue_available_materials_to_work_order'), false);
});
