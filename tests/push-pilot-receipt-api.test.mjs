import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const helper = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(new URL('../lib/notifications/pilot-receipts.ts', import.meta.url), 'utf8'))).toString('base64'));
const source = stripTypeScriptTypes(readFileSync(new URL('../app/api/notifications/push/receipt/route.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, ''))
  .replace(/export /g, '');
function setup({ email = 'juan@n3uralia.com', user = 'owner', org = 'org', expired = false } = {}) {
  const proof = helper.createPilotReceipt();
  const record = { id: 'subscription', user_id: 'owner', organization_id: 'org', enabled: true, last_test_id: proof.testId,
    last_test_at: new Date(Date.now() - (expired ? 11 * 60 * 1000 : 0)).toISOString(), last_test_receipt_hash: proof.tokenHash };
  const updates = [];
  const queries = [];
  const supabase = { from(table) {
    assert.equal(table, 'user_push_subscriptions');
    const filters = {};
    const q = {
      select(columns) { assert.ok(!columns.includes('endpoint')); return q; },
      eq(key, value) { filters[key] = value; return q; },
      async maybeSingle() {
        queries.push({ ...filters });
        return { data: Object.entries(filters).every(([k,v]) => record[k] === v) ? record : null, error: null };
      },
      update(patch) { updates.push({ patch, filters }); return q; },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    };
    return q;
  } };
  const handler = vm.runInNewContext('(function () {' + source + '\nreturn POST;})()', {
    NextResponse: { json(data, options) { return { data, status: options?.status || 200 }; } },
    getOrganizationContext: async () => ({ ok: true, userEmail: email, userId: user, organizationId: org, supabase }),
    authenticPilotReceipt: helper.authenticPilotReceipt, pilotReceiptPatch: helper.pilotReceiptPatch,
    validPilotReceipt: helper.validPilotReceipt,
  });
  return { proof, record, updates, queries, send: (body) => handler({ json: async () => body }) };
}
test('receipt cannot be submitted by a non-pilot account', async () => {
  const c = setup({ email: 'other@example.com' });
  assert.equal((await c.send({ ...c.proof, stage: 'received' })).status, 403);
  assert.equal(c.queries.length, 0);
  assert.equal(c.updates.length, 0);
});
test('valid receipt updates only its organization/user/current proof', async () => {
  const c = setup();
  assert.equal((await c.send({ ...c.proof, stage: 'displayed' })).status, 200);
  assert.equal(c.updates.length, 1);
  assert.equal(c.updates[0].filters.organization_id, 'org');
  assert.equal(c.updates[0].filters.user_id, 'owner');
  assert.equal(c.updates[0].filters.last_test_id, c.proof.testId);
  assert.equal(c.updates[0].filters.last_test_receipt_hash, c.proof.tokenHash);
  assert.ok(c.updates[0].patch.last_test_displayed_at);
  assert.equal(c.updates[0].patch.last_test_received_at, undefined);
});
test('valid encrypted proof cannot alter another user or tenant', async () => {
  for (const scope of [{ user: 'different' }, { org: 'different' }]) {
    const c = setup(scope);
    assert.equal((await c.send({ ...c.proof, stage: 'received' })).status, 403);
    assert.equal(c.updates.length, 0);
  }
});
test('receipt requires the encrypted capability and expires', async () => {
  const c = setup();
  assert.equal((await c.send({ ...c.proof, token: 'x'.repeat(43), stage: 'received' })).status, 403);
  assert.equal(c.updates.length, 0);
  const old = setup({ expired: true });
  assert.equal((await old.send({ ...old.proof, stage: 'received' })).status, 403);
  assert.equal(old.updates.length, 0);
});
test('raw client errors are not stored and unrecognized visibility claims are rejected', async () => {
  const c = setup();
  assert.equal((await c.send({ ...c.proof, stage: 'visible' })).status, 400);
  assert.equal((await c.send({ ...c.proof, stage: 'display_failed', error: 'raw client detail' })).status, 200);
  assert.deepEqual(c.updates[0].patch, { last_test_display_error: 'notification_api_failed' });
});
