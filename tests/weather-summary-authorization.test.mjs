import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/api/weather/summary/route.ts', 'utf8');
function harness({ organizationId = 'tenant-a', authorized = true, error = null, data = [] } = {}) {
  const calls = [];
  const module = { exports: {} };
  const context = authorized ? { ok: true, organizationId, supabase: {
    async rpc(name, args) { calls.push({ name, args }); return { data, error }; }
  }} : { ok: false, response: { status: 401 } };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { module, exports: module.exports, require(name) {
    if (name === 'next/server') return { NextResponse: { json(body, options) { return { body, ...options, status: options?.status ?? 200 }; } } };
    if (name === '@/lib/api/organization-context') return { getOrganizationContext: async () => context };
    throw new Error('Unexpected module: ' + name);
  } });
  return { GET: module.exports.GET, calls };
}
test('weather summary denies unauthenticated requests before database access', async () => {
  const { GET, calls } = harness({ authorized: false });
  assert.equal((await GET({})).status, 401);
  assert.equal(calls.length, 0);
});
test('weather summary uses verified tenant rather than request input', async () => {
  const { GET, calls } = harness({ organizationId: 'tenant-a' });
  const result = await GET({ url: 'https://example.test/?organizationId=tenant-b' });
  assert.equal(result.status, 200);
  assert.equal(calls[0].args.p_organization_id, 'tenant-a');
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
});
test('weather summary distinguishes empty readings from database errors', async () => {
  assert.equal((await harness().GET({})).status, 200);
  const failed = await harness({ error: { message: 'internal' } }).GET({});
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.includes('internal'), false);
});
