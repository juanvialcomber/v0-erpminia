import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const paths = [
  'whatsapp-history',
  'whatsapp-media',
  'whatsapp-vision',
  'messages-push',
  'whatsapp-daily',
  'maintenance-analytics-daily',
  'role-kpi-snapshots-daily',
];

for (const route of paths) {
  test(`cron executor must be explicitly enabled: ${route}`, () => {
    const source = readFileSync(new URL(`../app/api/cron/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /process\.env\.MOTIL_CRON_EXECUTOR_ENABLED === 'true'/);
    assert.match(source, /if \(!cronExecutorEnabled\(\)\)/);
    assert.match(source, /Cron executor disabled on this deployment/);
    assert.match(source, /status: 503/);
  });
}
