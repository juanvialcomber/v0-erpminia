import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api=await readFile(new URL('../app/api/finance/payment-requests/route.ts',import.meta.url),'utf8');
const page=await readFile(new URL('../app/dashboard/finanzas/pagos/page.tsx',import.meta.url),'utf8');

test('payment request signatures require finance write access and tenant scope',()=>{
 assert.match(api,/MODULE_KEYS\.FIN_FINANZAS,true/);
 assert.match(api,/organization_id/);
 assert.match(api,/pending_signatures/);
});

test('payment request signatures enforce separation and one decision per signer',()=>{
 assert.match(api,/paymentRequest\.created_by===auth\.context\.userId/);
 assert.match(api,/El creador de la solicitud no puede firmarla/);
 assert.match(api,/signer_id/);
 assert.match(api,/Ya registraste una decisión para esta solicitud/);
 assert.match(api,/El rechazo requiere una observación/);
});

test('two approvals can approve the request but cannot execute money',()=>{
 assert.match(api,/approvedCount>=Number\(paymentRequest\.required_signatures/);
 assert.match(api,/status:'approved'/);
 assert.match(api,/execution:false/);
 assert.match(api,/MOTIL no ejecutó ningún pago/);
 assert.doesNotMatch(api,/record_supplier_payment|procurement_supplier_payments/);
});

test('Treasury exposes explicit approve/reject controls without transfer execution',()=>{
 assert.match(page,/Solicitudes por firmar/);
 assert.match(page,/Dos firmas distintas son obligatorias/);
 assert.match(page,/Firmar no ejecuta la transferencia/);
 assert.match(page,/Motivo del rechazo/);
 assert.match(page,/Esperando otra firma/);
});
