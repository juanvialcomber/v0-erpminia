import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const page = readFileSync(new URL('../app/dashboard/notificaciones/prueba/page.tsx', import.meta.url), 'utf8');
const raw = readFileSync(new URL('../app/api/notifications/push/route.ts', import.meta.url), 'utf8');
const source = stripTypeScriptTypes(raw.replace(/^import .*;\n/gm, '')).replace(/export /g, '');

function testRoute(body) {
  let dbAccessed = false;
  const PUT = vm.runInNewContext('(function () {' + source + '\nreturn PUT;})()', {
    URL,
    NextResponse: { json(data, options) { return { status: options?.status || 200, data }; } },
    getOrganizationContext: async () => ({
      ok: true, userEmail: 'juan@n3uralia.com', organizationId: 'org', userId: 'user',
      supabase: { from() { dbAccessed = true; throw new Error('no database lookup expected'); } },
    }),
    getWebPushConfigError: () => null,
    createPilotReceipt() { throw new Error('not expected'); },
    sendWebPush() { throw new Error('not expected'); },
  });
  return { response: PUT({ json: async () => body }), dbWasAccessed: () => dbAccessed };
}

test('browser must provide its current subscription before triggering a remote push', () => {
  assert.match(page, /if \(!subscription\) throw new Error\('Activa las notificaciones/);
  assert.match(page, /api\('PUT', \{ endpoint: subscription\.endpoint \}\)/);
  assert.doesNotMatch(page, /api\('PUT', subscription \?/);
});

test('missing endpoint cannot fan out to historic subscriptions', async () => {
  for (const body of [null, {}, { endpoint: '' }]) {
    const context = testRoute(body);
    const result = await context.response;
    assert.equal(result.status, 400);
    assert.equal(context.dbWasAccessed(), false);
  }
});

test('malformed endpoint is rejected without reading device subscriptions', async () => {
  const context = testRoute({ endpoint: 'http://127.0.0.1/private' });
  const result = await context.response;
  assert.equal(result.status, 400);
  assert.equal(context.dbWasAccessed(), false);
});
