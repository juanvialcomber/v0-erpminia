import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../app/api/maintenance/whatsapp/review-queue/route.ts', import.meta.url), 'utf8');

test('review queue requires module and authenticated organization context', () => {
  assert.match(source,/requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(source,/getOrganizationContext\(request\)/);
  assert.match(source,/\.eq\('organization_id', context\.organizationId\)/);
});
test('review queue keeps source evidence and never publishes operational data', () => {
  assert.match(source,/message_id,group_id,group_name,sender_name,message_type,body/);
  assert.match(source,/\.limit\(100\)/);
  assert.match(source,/suggestWhatsappReviewDestinations\(row\)/);
  assert.match(source,/read_only: true/);
  assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
