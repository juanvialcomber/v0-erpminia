import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const orchestrator = readFileSync(new URL('../lib/motil-ai/skills/orchestrator.ts', import.meta.url), 'utf8');
const result = readFileSync(new URL('../lib/motil-ai/skills/result-contract.ts', import.meta.url), 'utf8');

test('skill plans cap internal composition and preserve simple product presentation', () => {
  assert.match(orchestrator, /maxSkills = 3/);
  assert.match(orchestrator, /showOneConclusionFirst: true/);
  assert.match(orchestrator, /showOneNextAction: true/);
  assert.match(orchestrator, /progressiveDisclosure: true/);
});

test('grounded skill results degrade instead of asserting conclusions without evidence', () => {
  assert.match(result, /result\.status === 'ready' && result\.evidence\.length === 0/);
  assert.match(result, /status: 'partial'/);
  assert.match(result, /conclusion: null/);
});
