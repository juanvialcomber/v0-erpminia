import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/data-quality/reconciliation/route.ts', import.meta.url), 'utf8');

test('reconciliation endpoint persists human review decisions without mutating canonical or external source data', () => {
  assert.match(route, /export async function PATCH/);
  assert.match(route, /data_reconciliation_reviews/);
  assert.match(route, /sourceModified: false/);
  assert.match(route, /El dato fuente no fue modificado/);
  assert.doesNotMatch(route, /\.from\('products'\)\.update/);
  assert.doesNotMatch(route, /\.from\('suppliers'\)\.update/);
  assert.doesNotMatch(route, /schema\('integration'\)[\s\S]{0,500}\.update\(/);
});

test('external reconciliation issues join the same review queue and remain optional before integration deploy', () => {
  assert.match(route, /schema\('integration'\)/);
  assert.match(route, /reconciliation_items/);
  assert.match(route, /external:\$\{row\.id\}/);
  assert.match(route, /External integration intake is optional until its migration is deployed/);
});

test('review writes are tenant scoped and restricted to admin data governance boundary', () => {
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /organization_id: context\.organizationId/);
  assert.match(route, /onConflict: 'organization_id,issue_key'/);
});

test('closing a review requires a written rationale', () => {
  assert.match(route, /status !== 'open' && !resolutionNote/);
  assert.match(route, /Debes registrar el fundamento de la decisión/);
});
