import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/legal/payment-certificate-drafts/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/avances-pagos/page.tsx', import.meta.url), 'utf8');

test('MOTIL derives payment-certificate candidates from structured contract evidence', () => {
  assert.match(api, /LEGAL_PROGRESS_MILESTONES/);
  assert.match(api, /pendingToInvoice/);
  assert.match(api, /progressRatio/);
  assert.match(api, /purchaseOrderNumber/);
  assert.match(api, /sourceSheet/);
  assert.match(api, /sourceRow/);
});

test('payment-certificate candidates remain human-reviewed and read-only', () => {
  assert.match(api, /MOTIL prepara el borrador/);
  assert.match(api, /no es una aprobación, factura ni autorización de pago/);
  assert.doesNotMatch(api, /export async function POST/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.delete\(/);
});

test('Elias sees prepared work and one next action inside contracts and payments', () => {
  assert.match(page, /Trabajo preparado por MOTIL/);
  assert.match(page, /Estados de pago candidatos/);
  assert.match(page, /Pendiente de facturar/);
  assert.match(page, /Siguiente acción:/);
  assert.match(page, /Legal conserva la decisión/);
  assert.match(page, /\/dashboard\/legal\/pagos-facturas/);
  assert.doesNotMatch(page, /Legal ↔ Laudus/);
});
