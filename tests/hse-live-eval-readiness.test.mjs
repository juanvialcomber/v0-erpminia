import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const executive = readFileSync('app/api/intelligence/executive-assistant/route.ts', 'utf8');
const grounded = readFileSync('tests/fixtures/hse-grounded-qa.v1.json', 'utf8');
const cases = JSON.parse(grounded).cases;

test('Executive assistant has authenticated POST contract, not a read-only evaluator', () => {
  assert.match(executive, /export async function POST\(request: NextRequest\)/);
  assert.match(executive, /resolveExecutiveAccess\(request\)/);
  assert.match(executive, /typeof body\?\.message === 'string'/);
  assert.match(executive, /resolveCoreConversation\(/);
  assert.match(executive, /appendCoreMessage\(/);
});
test('HSE live evaluations remain gated until a dedicated read-only authenticated evaluation path exists', () => {
  assert.equal(cases.length, 6);
  assert.equal(cases.filter(row => !row.expectedRule).length, 3);
  // Never issue test POSTs to the executive assistant: they persist conversation messages.
  assert.doesNotMatch(executive, /list_hse_review_controls|list_hse_evidence_graph/);
});
