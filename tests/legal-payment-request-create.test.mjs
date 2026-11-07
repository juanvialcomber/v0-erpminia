import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api=await readFile(new URL('../app/api/legal/payment-requests/route.ts',import.meta.url),'utf8');
const page=await readFile(new URL('../app/dashboard/legal/pagos-facturas/page.tsx',import.meta.url),'utf8');

test('Legal can only prepare a request from an exact actionable MOTIL payable',()=>{
 assert.match(api,/MODULE_KEYS\.LEGAL_MODULO/);
 assert.match(api,/access !== 'ED'/);
 assert.match(api,/procurement_accounts_payable_v1/);
 assert.match(api,/outstanding<=0/);
 assert.match(api,/!payable\.due_date/);
 assert.match(api,/\['open','partially_paid'\]/);
 assert.match(api,/finance_payment_requests/);
 assert.match(api,/pending_signatures/);
 assert.match(api,/required_signatures:2/);
});

test('Legal payment request creation is deduplicated and never executes payment',()=>{
 assert.match(api,/ACTIVE_REQUEST_STATUSES/);
 assert.match(api,/Ya existe una solicitud de pago activa/);
 assert.match(api,/Solicitud creada para firmas\. MOTIL no ejecutó ningún pago/);
 assert.doesNotMatch(api,/record_supplier_payment|procurement_supplier_payments/);
});

test('Elias confirms request creation in two visible steps',()=>{
 assert.match(page,/Crear solicitud para firmas/);
 assert.match(page,/Confirmar solicitud/);
 assert.match(page,/pendiente de 2 firmas\. No ejecuta el pago/);
 assert.match(page,/\/api\/legal\/payment-requests/);
});


test('payment request creation writes value evidence without blocking the financial action',()=>{
 assert.match(api,/audit_log/);
 assert.match(api,/legal\.payment_request\.created/);
 assert.match(api,/auditError/);
});
