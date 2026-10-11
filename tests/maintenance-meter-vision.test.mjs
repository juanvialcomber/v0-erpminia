import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const endpoint = new URL('../app/api/maintenance/runtime-readings/analyze-photo/route.ts', import.meta.url);
const page = new URL('../app/dashboard/mantenimiento/horometros/page.tsx', import.meta.url);

test('hour meter vision is server-only and requires operational write authorization', async () => {
  const source = await readFile(endpoint, 'utf8');
  assert.match(source, /process\.env\.OPENAI_API_KEY/);
  assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(source, /eq\('organization_id', context\.organizationId\)/);
  assert.match(source, /input_image/);
  assert.doesNotMatch(source, /\.from\('asset_runtime_readings'\)\s*\.insert/);
});

test('mobile photo requires mechanic confirmation before writing canonical hours', async () => {
  const source = await readFile(page, 'utf8');
  assert.match(source, /analyzeMeterPhoto/);
  assert.match(source, /setMeterHours\(String\(result\.meterHours\)\)/);
  assert.match(source, /saveReading/);
  assert.match(source, /analyzingPhoto/);
});
