import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../app/api/data-quality/health/route.ts', import.meta.url);
const pageUrl = new URL('../app/dashboard/calidad-datos/salud/page.tsx', import.meta.url);

test('Data Health exposes Intelligence Core runtime health only to admins', async () => {
  const api = await readFile(apiUrl, 'utf8');

  assert.match(api, /access\.admin\s*\? context\.supabase/);
  assert.match(api, /\.from\('motil_ai_core_errors'\)/);
  assert.match(api, /\.eq\('organization_id', org\)/);
  assert.match(api, /\.gte\('created_at'/);
  assert.match(api, /key: 'intelligence'/);
  assert.match(api, /label: 'Inteligencia MOTIL'/);
  assert.match(api, /Errores · 24 h/);
  assert.match(api, /Errores · 7 días/);
});

test('Intelligence Core health is diagnostic and does not mutate canonical data', async () => {
  const api = await readFile(apiUrl, 'utf8');

  assert.doesNotMatch(api, /motil_ai_core_errors'\)\.insert/);
  assert.doesNotMatch(api, /motil_ai_core_errors'\)\.update/);
  assert.doesNotMatch(api, /motil_ai_core_errors'\)\.delete/);
  assert.match(api, /no afecta por sí solo los datos canónicos/);
});

test('Data Health renders full runtime timestamps safely', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}T/);
  assert.match(page, /new Date\(metric\.value\)\.toLocaleString\('es-CL'\)/);
});

test('executive assistant degrades quota exhaustion as service unavailable', async () => {
  const route = await readFile(new URL('../app/api/intelligence/executive-assistant/route.ts', import.meta.url), 'utf8');
  const observability = await readFile(new URL('../lib/intelligence/core-error-observability.ts', import.meta.url), 'utf8');

  assert.match(route, /quotaError/);
  assert.match(route, /temporarily sin capacidad disponible|temporalmente sin capacidad disponible/);
  assert.match(route, /configurationError \|\| quotaError \? 503 : 500/);
  assert.match(observability, /return 'ai_quota_exhausted'/);
});

test('executive assistant uses bounded N3 Model Router fallback', async () => {
  const route = await readFile(new URL('../app/api/intelligence/executive-assistant/route.ts', import.meta.url), 'utf8');

  assert.match(route, /task_class: 'motil-executive-assistant'/);
  assert.match(route, /capability: 'long-context'/);
  assert.match(route, /N3_MODEL_ROUTER_URL/);
  assert.match(route, /N3_MODEL_ROUTER_MOTIL_TOKEN/);
  assert.match(route, /x-n3-service-token/);
  assert.match(route, /return await callN3RouterFallback/);
  assert.doesNotMatch(route, /OPENROUTER_API_KEY/);
});
