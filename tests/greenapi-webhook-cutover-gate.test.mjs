import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../app/api/integrations/greenapi/webhook/route.ts', import.meta.url), 'utf8');

test('Green API webhook requires explicit activation during GitHub handover', () => {
  assert.match(source, /process\.env\.MOTIL_GREENAPI_WEBHOOK_ENABLED !== 'true'/);
  assert.match(source, /Webhook receptor no habilitado en este despliegue/);
  assert.match(source, /status: 503/);
});

test('Green API webhook preserves validation and group exclusion', () => {
  assert.match(source, /validWebhookToken/);
  assert.match(source, /isExcludedMotilWhatsappGroup/);
  assert.match(source, /if \(!group\?\.enabled\)/);
});
