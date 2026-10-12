import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/messages/motil-messages.tsx', import.meta.url), 'utf8');
test('unsent drafts remain scoped to their selected conversation', () => {
  assert.match(source, /draftsByThread = useRef<Record<string, string>>/);
  assert.match(source, /setDraft\(threadId \? draftsByThread\.current\[threadId\] \|\| '' : ''\)/);
  assert.match(source, /draftsByThread\.current\[threadId\] = event\.target\.value/);
  assert.match(source, /delete draftsByThread\.current\[threadId\]/);
  assert.match(source, /composerThreadRef\.current === threadId/);
});
