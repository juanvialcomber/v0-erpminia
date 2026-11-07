import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../app/api/alertas/route.ts', import.meta.url);
const pageUrl = new URL('../app/dashboard/alertas/page.tsx', import.meta.url);

test('personal alert center scopes each source to its responsible user', async () => {
  const api = await readFile(apiUrl, 'utf8');

  assert.match(api, /operational_task_inbox_by_user_v2/);
  assert.match(api, /\.eq\('profile_id', context\.userId\)/);
  assert.match(api, /\.eq\('responsibility', 'owner'\)/);
  assert.match(api, /\.eq\('assigned_person_id', currentPersonId\)/);
  assert.match(api, /\.eq\('assigned_to', context\.userId\)/);
  assert.match(api, /\.eq\('responsible_person', context\.userId\)/);
  assert.match(api, /isBodegaOwner\s*\?/);
  assert.match(api, /isElias\s*\?/);
});

test('alerts expose concrete next-action language instead of a generic source link', async () => {
  const api = await readFile(apiUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(api, /Resolver OT/);
  assert.match(api, /Investigar incidente/);
  assert.match(api, /Completar inspección/);
  assert.match(api, /Revisar riesgo/);
  assert.match(api, /task\.role_action \|\| task\.evidence_summary/);
  assert.match(page, /alert\.actionLabel \|\| defaultActionLabel\(alert\.type\)/);
  assert.doesNotMatch(page, />Abrir fuente<\/Link>/);
});
