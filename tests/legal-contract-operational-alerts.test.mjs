import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/alertas/route.ts', import.meta.url), 'utf8');
const header = await readFile(new URL('../components/layout/header.tsx', import.meta.url), 'utf8');

test('contract alerts are restricted to the canonical Legal owner', () => {
  assert.match(api, /eliasfernandez@lapatagua\.cl/);
  assert.match(api, /RESPONSABLE DE LEGAL/);
  assert.match(api, /isLegalOwner/);
  assert.doesNotMatch(api, /ariellopez@lapatagua\.cl/);
  assert.doesNotMatch(api, /isAriel/);
  assert.match(header, /const canSeeAlerts=Boolean\(user\)/);
});

test('contract alerts use Elias source dates and incomplete structured progress', () => {
  assert.match(api, /LEGAL_CONTRACT_SOURCE_META/);
  assert.match(api, /LEGAL_PROGRESS_MILESTONES/);
  assert.match(api, /progress\.progressRatio >= 0\.999/);
  assert.match(api, /days > 15/);
  assert.match(api, /Fecha fuente Elías/);
  assert.match(api, /no declaración automática de incumplimiento/);
  assert.match(api, /\/dashboard\/legal\/avances-pagos/);
});

test('contract alert generation is read-only', () => {
  assert.doesNotMatch(api, /\.from\('contracts'\)\.update|\.from\('contract_progress_updates'\)\.insert/);
});
