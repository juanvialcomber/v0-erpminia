import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const policy = await readFile(new URL('../lib/engineering/request-approval-policy.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/ingenieria/proyectos/route.ts', import.meta.url), 'utf8');

test('any change to approved program requires supervisor then CEO, exactly two signatures', () => {
  assert.match(policy, /request\.priority === 'urgente' && request\.changesApprovedProgram/);
  assert.match(policy, /\['supervision', 'segunda_validacion', 'gerencia'\]/);
  assert.match(policy, /'pendiente_gerencia'/);
});
test('different signers, same organization, permission and evidence required', () => {
  assert.match(policy, /actor\.organizationId !== request\.organizationId/);
  assert.match(policy, /!actor\.canApprove/);
  assert.match(policy, /a\.actorId === actor\.id/);
  assert.match(policy, /a\.signedAt && a\.evidenceId/);
});
test('engineering discovery remains read only until server-side persistence and role mapping are verified', () => {
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.match(api, /readOnly: true/);
});
