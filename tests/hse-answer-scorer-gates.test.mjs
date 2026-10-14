import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/evaluate-hse-answers.mjs', 'utf8');

test('HSE answer scorer checks factual content in addition to citations', () => {
  assert.match(source, /const requiredTerms =/);
  assert.match(source, /HSE-Q01/);
  assert.match(source, /HSE-Q02/);
  assert.match(source, /HSE-Q03/);
  assert.match(source, /sourceOk && factualOk && abstentionOk/);
});

test('HSE answer scorer demands abstention for unsupported facts', () => {
  assert.match(source, /answer\?\.abstained === true/);
  assert.match(source, /noApprovalClaim/);
});
