import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('app/api/legal/hse-controls/evaluation/route.ts', 'utf8');
test('evidence GET is authenticated and scoped', () => {
  assert.match(source, /export async function GET/);
  assert.match(source, /getOrganizationContext/);
  assert.match(source, /MODULE_KEYS\.LEGAL_MODULO/);
  assert.match(source, /list_hse_review_controls/);
  assert.match(source, /modelExecuted: false/);
});
test('isolated model runner requires elevated permission and explicit consent', () => {
  assert.match(source, /export async function POST/);
  assert.match(source, /access !== 'ED'/);
  assert.match(source, /body\?\.mode !== 'isolated-evaluation'/);
  assert.match(source, /body\?\.confirm !== true/);
  assert.match(source, /modelExecuted: true/);
});
test('no chat persistence, no HSE review mutations', () => {
  assert.doesNotMatch(source, /appendCoreMessage|resolveCoreConversation|review_hse_control|propose_hse_module_link/);
  assert.match(source, /persisted: false/);
  assert.match(source, /AbortSignal\.timeout/);
});
