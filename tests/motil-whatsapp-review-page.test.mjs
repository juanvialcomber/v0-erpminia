import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../app/dashboard/mantenimiento/whatsapp-revision/page.tsx', import.meta.url), 'utf8');
test('WhatsApp review presents source identity, group, timestamp and sections', () => {
  assert.match(page, /whatsapp\/review-queue/);
  assert.match(page, /message\.sender_name/);
  assert.match(page, /message\.group_name/);
  assert.match(page, /message\.received_at/);
  assert.match(page, /message\.review_items\.map/);
  assert.match(page, /item\.suggested_destinations/);
});
test('WhatsApp review never writes operational data', () => {
  assert.match(page, /Solo lectura/);
  assert.match(page, /No publicado/);
  assert.match(page, /whatsapp\/review-decisions/);
  assert.match(page, /method: 'POST'/);
  assert.doesNotMatch(page, /method:\s*['"](?:PUT|PATCH|DELETE)/);
  assert.doesNotMatch(page, /whatsapp\/operational-activities/);
});
