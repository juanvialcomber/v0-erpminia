import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../lib/messages/push-dispatcher.ts', import.meta.url), 'utf8');

test('skipped push jobs retain an actionable diagnostic for missing targets', () => {
  assert.match(source, /diagnostic = !message \? 'message_unavailable' : 'recipient_inactive_or_unavailable'/);
  assert.match(source, /diagnostic = 'no_active_push_device'/);
  assert.match(source, /p_error_code: diagnostic/);
  assert.match(source, /motil_message_finish_push/);
});
