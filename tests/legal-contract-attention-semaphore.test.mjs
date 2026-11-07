import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/legal/contract-progress-source.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/contract-payment-control/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/avances-pagos/page.tsx', import.meta.url), 'utf8');

test('contract schedule dates remain source metadata rather than canonical contract mutation', () => {
  assert.match(source, /LEGAL_CONTRACT_SOURCE_META/);
  assert.match(source, /sourceSheet: 'Control Contrato RPR Fase 1'/);
  assert.match(source, /endDate: '2027-06-14'/);
  assert.match(source, /Fecha de término no informada en la hoja fuente/);
});

test('contract attention semaphore is deterministic and review-oriented', () => {
  assert.match(api, /daysToEnd >= 0 && daysToEnd <= 15/);
  assert.match(api, /attentionState/);
  assert.match(api, /budgetOverrun/);
  assert.match(api, /signals?|señales? de revisión/i);
  assert.match(page, /100% verificado/);
  assert.match(page, /≤15 días/);
  assert.match(page, /Término fuente:/);
  assert.match(page, /Fecha de término no informada\/utilizable en la fuente/);
});
