import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api=await readFile(new URL('../app/api/legal/payment-request-readiness/route.ts',import.meta.url),'utf8');
const page=await readFile(new URL('../app/dashboard/legal/pagos-facturas/page.tsx',import.meta.url),'utf8');

test('payment request readiness requires exact MOTIL payable identity and balance',()=>{
 assert.match(api,/procurement_accounts_payable_v1/);
 assert.match(api,/row\.supplier_id === contract\?\.supplier_id/);
 assert.match(api,/normalize\(row\.invoice_number\) === normalize\(invoice\.docNumber\)/);
 assert.match(api,/String\(row\.currency/);
 assert.match(api,/outstanding_amount/);
 assert.match(api,/due_date/);
});

test('payment request readiness fails closed instead of inferring payment authority',()=>{
 assert.match(api,/needs_payable_promotion/);
 assert.match(api,/needs_due_date/);
 assert.match(api,/conflict/);
 assert.match(api,/Listo para solicitar pago no significa aprobado ni pagado/);
 assert.doesNotMatch(api,/export async function POST/);
 assert.doesNotMatch(api,/\.insert\(|\.update\(|\.delete\(/);
});

test('Elias sees the payment gate and one next action inside MOTIL',()=>{
 assert.match(page,/Listo para solicitar pago/);
 assert.match(page,/Falta CxP MOTIL/);
 assert.match(page,/Falta vencimiento/);
 assert.match(page,/Siguiente acción:/);
 assert.match(page,/flujo de firmas/);
});
