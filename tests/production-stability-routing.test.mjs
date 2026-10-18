import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const inboxRoute = await readFile(new URL('../app/api/actions/inbox/route.ts', import.meta.url), 'utf8');
const administrationRoot = await readFile(new URL('../app/dashboard/administracion/page.tsx', import.meta.url), 'utf8');
const mediaWebImportRoute = await readFile(new URL('../app/api/cron/product-media-web-import/route.ts', import.meta.url), 'utf8');
const mediaGenerationRoute = await readFile(new URL('../app/api/cron/product-media-generation/route.ts', import.meta.url), 'utf8');

test('Vercel no longer schedules the redundant product-media autopilot routes', () => {
  const cronPaths = (vercelConfig.crons ?? []).map((cron) => cron.path);

  assert.doesNotMatch(cronPaths.join('\n'), /product-media-web-import/);
  assert.doesNotMatch(cronPaths.join('\n'), /product-media-generation/);
  if (cronPaths.length) assert.ok(cronPaths.includes('/api/cron/maintenance-analytics-daily'));
  if (cronPaths.length) assert.ok(cronPaths.includes('/api/cron/role-kpi-snapshots-daily'));
});

test('unscheduled product-media routes remain protected', () => {
  assert.match(mediaWebImportRoute, /CRON_SECRET/);
  assert.match(mediaWebImportRoute, /requireAdmin|getOrganizationContext/);
  assert.match(mediaGenerationRoute, /CRON_SECRET/);
  assert.match(mediaGenerationRoute, /Unauthorized/);
});

test('role inbox short-circuits cargos outside canonical operational coverage before scoped task queries', () => {
  assert.match(inboxRoute, /operational_role_inbox_coverage_v1/);
  assert.match(inboxRoute, /hasPrivateFinanceInbox/);
  assert.match(inboxRoute, /JEFE ADM\./);
  assert.match(inboxRoute, /!coverageError && !coverage && !hasPrivateFinanceInbox/);

  const coverageGuard = inboxRoute.indexOf('!coverageError && !coverage && !hasPrivateFinanceInbox');
  const scopedTaskLookup = inboxRoute.indexOf(".from('role_tasks_actionable_v1')");
  assert.ok(coverageGuard >= 0 && scopedTaskLookup > coverageGuard);
});

test('role inbox continues with scoped canonical task sources if coverage optimization fails', () => {
  assert.match(inboxRoute, /coverage lookup failed; continuing with scoped task queries/);
  assert.match(inboxRoute, /role_tasks_actionable_v1/);
  assert.match(inboxRoute, /role_task_escalations_v1/);
  assert.doesNotMatch(inboxRoute, /\.from\('role_task_frontend_v1'\)/);
});

test('administration root has a stable destination instead of returning 404', () => {
  assert.match(administrationRoot, /redirect\('\/dashboard\/administracion\/sii'\)/);
});
