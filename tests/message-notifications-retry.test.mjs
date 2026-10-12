import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/messages/message-notifications.tsx', import.meta.url), 'utf8');
test('notification bell exposes actionable recovery when unread loading fails', () => {
  assert.match(source, /const \{ data, error, isLoading, mutate \} = useUnreadMessages\(\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /onClick=\{\(\) => void mutate\(\)\}/);
  assert.match(source, /'Reintentar' : 'Retry'/);
});
