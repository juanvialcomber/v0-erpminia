import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api=readFileSync('app/api/legal/asistente/route.ts','utf8');
const page=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
const nav=readFileSync('app/dashboard/legal/layout.tsx','utf8');
test('legal AI requires authenticated module access and tenant boundaries',()=>{
 assert.match(api,/requireModuleAccess\(request, MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(api,/\.eq\('organization_id', access\.organizationId\)/);
 assert.match(api,/companiesByRut\.has\(rutKey\(f\.empresa_rut\)\)/);
});
test('assistant is advisory and sources are traceable',()=>{
 assert.match(api,/No apruebes, rechaces/);
 assert.match(api,/SERNAGEOMIN/);
 assert.match(api,/www\.bcn\.cl/);
 assert.match(page,/Asistente IA de Legal/);
 assert.match(nav,/\/dashboard\/legal\/asistente/);
});


test('legal assistant receives contract progress and Laudus payment evidence without payment authority',()=>{
 assert.match(api,/LEGAL_PROGRESS_MILESTONES/);
 assert.match(api,/laudus_purchase_invoice_payment_status_service_v1/);
 assert.match(api,/contractPaymentEvidence/);
 assert.match(api,/Facturado nunca significa pagado/);
 assert.match(api,/ejecutes pagos/);
 assert.match(api,/retención contractual/);
});
