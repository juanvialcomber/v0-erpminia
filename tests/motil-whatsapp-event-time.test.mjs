import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rule = readFileSync(new URL('../lib/maintenance/whatsapp-event-time.ts', import.meta.url), 'utf8');
const items = readFileSync(new URL('../lib/maintenance/whatsapp-review-items.ts', import.meta.url), 'utf8');

test('temporal semantics distinguish completed work, future work and historic status snapshots', () => {
  assert.match(rule, /'completed' \| 'planned' \| 'status_report' \| 'unknown'/);
  assert.match(rule, /trabajos realizados/);
  assert.match(rule, /trabajos para hoy/);
  assert.match(rule, /fuera de servicio/);
  assert.match(items, /event_time_kind: inferEventTimeKind\(chunk\)/);
  assert.match(items, /publication_allowed: false/);
});
