import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/maintenance/whatsapp-review-items.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/maintenance/whatsapp/review-queue/route.ts', import.meta.url), 'utf8');

test('review items keep message identity and stable ordinal, without automatic publication', () => {
  assert.match(source, /message_id: message\.message_id/);
  assert.match(source, /item_index/);
  assert.match(source, /requires_human_review: true/);
  assert.match(source, /publication_allowed: false/);
  assert.match(route, /review_items: splitWhatsappReviewItems\(row\)/);
});
test('empty media messages are not fabricated into textual activities', () => {
  assert.match(source, /if \(!lines\.length\) return \[\]/);
  assert.match(source, /chunks\.slice\(0, 40\)/);
});
