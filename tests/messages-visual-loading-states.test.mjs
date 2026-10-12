import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const component = read('components/messages/motil-messages.tsx');
const states = read('components/messages/messages-loading-skeletons.tsx');
test('Inbox and conversation history preserve geometry during loading', () => {
  assert.match(component, /<MessagesInboxSkeleton label=\{t\.loading\} \/>/);
  assert.match(component, /<MessagesHistorySkeleton label=\{t\.loading\} \/>/);
  assert.match(states, /min-h-\[430px\]/);
  assert.match(states, /motion-safe:animate-pulse/);
  assert.match(states, /aria-busy="true"/);
});
test('History failure offers a retry without resetting user conversation', () => {
  assert.match(component, /role="alert" className="flex flex-wrap/);
  assert.match(component, /onClick=\{\(\) => void reloadHistory\(\)\}/);
});
