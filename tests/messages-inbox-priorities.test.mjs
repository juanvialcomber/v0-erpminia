import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/messages/motil-messages.tsx', import.meta.url), 'utf8');
test('chat inbox prioritizes unread conversations without mutating canonical server order', () => {
  assert.match(source, /\.filter\(\(conversation\) => !unreadOnly \|\| conversation\.unread > 0 \|\| conversation\.id === threadId\)/);
  assert.match(source, /Number\(b\.unread > 0\) - Number\(a\.unread > 0\)/);
  assert.match(source, /\(b\.lastMessageAt \|\| ''\)\.localeCompare\(a\.lastMessageAt \|\| ''\)/);
  assert.match(source, /a\.id\.localeCompare\(b\.id\)/);
});
