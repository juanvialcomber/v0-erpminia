import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../app/api/actions/state/route.ts', import.meta.url);
const pageUrl = new URL('../components/actions/actions-inbox.tsx', import.meta.url);

test('role action state is validated against the current cargo worklist before persistence', async () => {
  const source = await readFile(apiUrl, 'utf8');

  assert.match(source, /\.from\('profiles'\)/);
  assert.match(source, /\.eq\('id', context\.userId\)/);
  assert.match(source, /\.eq\('organization_id', context\.organizationId\)/);
  assert.doesNotMatch(source, /\.from\('role_task_worklist_v1'\)/);
  assert.match(source, /\.from\('role_tasks_actionable_v1'\)/);
  assert.match(source, /\.from\('role_task_escalations_v1'\)/);
  assert.match(source, /\.eq\('cargo_id', profile\.cargo_id\)/);
  assert.match(source, /\.eq\('task_key', sourceKey\)/);
  assert.match(source, /La acción ya no está disponible para tu cargo/);
});

test('critical role actions cannot be snoozed and the UI does not offer that action', async () => {
  const api = await readFile(apiUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(api, /status === 'snoozed'.*task\.severity[\s\S]*critical/s);
  assert.match(api, /Una acción crítica no puede posponerse/);
  assert.match(page, /task\.severity !== 'critical'.*snoozed/s);
});

test('actions dashboard distinguishes unavailable summary and failed state writes from zero', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /summaryUnavailable = inbox\.isLoading \|\| Boolean\(inbox\.error\) \|\| !summary/);
  assert.match(page, /summaryUnavailable \? '—' : \(summary\[key\] \?\? '—'\)/);
  assert.match(page, /if \(!response\.ok\)/);
  assert.match(page, /setStateWriteError/);
  assert.doesNotMatch(page, /summary\?\.owners \?\? 0/);
  assert.doesNotMatch(page, /summary\?\.critical \?\? 0/);
});


test('finance manager can read and persist only personal action state through the shared actions endpoint', async () => {
  const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
  const api = await readFile(apiUrl, 'utf8');

  assert.ok(proxy.includes("if (path === '/api/actions/state') return true;"));
  assert.match(api, /\.eq\('user_id', context\.userId\)/);
  assert.match(api, /\.eq\('cargo_id', profile\.cargo_id\)/);
  assert.match(api, /\.eq\('task_key', sourceKey\)/);
  assert.match(api, /Una acción crítica no puede posponerse/);
});
