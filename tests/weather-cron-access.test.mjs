import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const compile = (path, modules, globals = {}) => {
  const module = { exports: {} };
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { module, exports: module.exports, require(name) {
    if (!(name in modules)) throw new Error('Unexpected module: ' + name);
    return modules[name];
  }, ...globals });
  return module.exports;
};

test('weather cron reaches its handler without an interactive user session; unrelated routes remain protected', async () => {
  let sessionChecks = 0;
  const makeResponse = (status, body) => ({
    status, body, headers: new Headers(), cookies: { get() {}, set() {} },
  });
  const { proxy } = compile('proxy.ts', {
    'next/server': { NextResponse: { next: () => makeResponse(200), json: (body, options) => makeResponse(options.status, body) } },
    '@supabase/supabase-js': { createClient() { throw new Error('Unexpected admin lookup'); } },
    '@supabase/ssr': { createServerClient: () => ({ auth: { async getUser() { sessionChecks++; return { data: { user: null } }; } } }) },
    '@/lib/auth/signed-session': { verifyCustomSession: async () => null },
    '@/lib/maintenance/viewer-mode': { resolveMaintenanceViewerMode: () => 'general' },
    '@/lib/i18n/dictionaries': { LOCALE_COOKIE: 'locale', LOCALE_HEADER: 'x-locale' },
  }, { process: { env: {} }, Headers, URL, console });
  const request = pathname => ({
    nextUrl: new URL('https://example.test' + pathname), url: 'https://example.test' + pathname,
    headers: new Headers(), method: 'GET', cookies: { get() {} },
  });
  assert.equal((await proxy(request('/api/cron/weather-capture'))).status, 200);
  assert.equal(sessionChecks, 0);
  assert.equal((await proxy(request('/api/weather/summary'))).status, 401);
  assert.equal((await proxy(request('/api/cron/weather-capture/untrusted'))).status, 401);
});

function captureHarness({ providerStatus = 200, insertError = null } = {}) {
  const calls = [];
  const now = Date.now();
  const secret = 'test-only-cron-secret-with-sufficient-length';
  const { GET } = compile('app/api/cron/weather-capture/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    'zod': { z },
    '@/lib/supabase-server': { getSupabaseServerClient: () => ({ async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'motil_weather_sites_v1') return { data: [{ site_id: '00000000-0000-4000-8000-000000000001', latitude: -32.5, longitude: -71.1 }], error: null };
      return { data: !insertError, error: insertError };
    } }) },
  }, {
    process: { env: { CRON_SECRET: secret, WEATHER_API_KEY: 'test-only-provider-key', NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key' } },
    URL, AbortSignal, Date, console: { info() {}, warn() {} },
    fetch: async () => ({ ok: providerStatus === 200, status: providerStatus, async json() { return { current: { last_updated_epoch: Math.floor(now / 1000), temp_c: 20, precip_mm: 0, humidity: 45, wind_kph: 12, gust_kph: 18, vis_km: 10 } }; } }),
  });
  return { GET, calls, request: token => ({ headers: new Headers(token ? { authorization: 'Bearer ' + token } : {}) }), secret };
}

test('weather handler denies missing or invalid cron credentials before accessing database', async () => {
  const h = captureHarness();
  assert.equal((await h.GET(h.request())).status, 401);
  assert.equal((await h.GET(h.request('wrong'))).status, 401);
  assert.equal(h.calls.length, 0);
});

test('authorized weather capture persists valid provider data including zero rainfall', async () => {
  const h = captureHarness();
  const response = await h.GET(h.request(h.secret));
  assert.equal(response.status, 200);
  assert.equal(response.body.inserted, 1);
  assert.equal(h.calls[1].name, 'motil_weather_insert_v1');
  assert.equal(h.calls[1].args.p_precipitation_mm, 0);
});

test('provider failure and database failure never report successful capture', async () => {
  const provider = captureHarness({ providerStatus: 403 });
  const failed = await provider.GET(provider.request(provider.secret));
  assert.equal(failed.status, 503);
  assert.equal(provider.calls.length, 1);
  const database = captureHarness({ insertError: { code: 'test-error' } });
  assert.equal((await database.GET(database.request(database.secret))).status, 503);
});
