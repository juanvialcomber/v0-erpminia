import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api=readFileSync('app/api/legal/asistente/route.ts','utf8');
const redirectPage=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
const widget=readFileSync('components/intelligence/senior-assistant-widget.tsx','utf8');
const context=readFileSync('lib/intelligence/assistant-context.ts','utf8');

test('legal AI requires authenticated module access and tenant boundaries',()=>{
 assert.match(api,/requireModuleAccess\(request, MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(api,/\.eq\('organization_id', access\.organizationId\)/);
 assert.match(api,/companiesByRut\.has\(rutKey\(f\.empresa_rut\)\)/);
});

test('assistant is advisory, traceable and exposed only through the floating chat',()=>{
 assert.match(api,/No apruebes, rechaces/);
 assert.match(api,/SERNAGEOMIN/);
 assert.match(api,/www\.bcn\.cl/);
 assert.match(redirectPage,/redirect\('\/dashboard\/legal'\)/);
 assert.match(widget,/endpoint: '\/api\/legal\/asistente'/);
 assert.match(context,/title: 'Asistente Legal MOTIL'/);
});

test('legal assistant receives contract progress and Laudus payment evidence without payment authority',()=>{
 assert.match(api,/LEGAL_PROGRESS_MILESTONES/);
 assert.match(api,/laudus_purchase_invoice_payment_status_service_v1/);
 assert.match(api,/contractPaymentEvidence/);
 assert.match(api,/Facturado nunca significa pagado/);
 assert.match(api,/ejecutes pagos/);
 assert.match(api,/retención contractual/);
});
