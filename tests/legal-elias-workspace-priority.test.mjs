import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/dashboard/legal/page.tsx','utf8');
test('Legal home loads real first-review and second-signature queues',()=>{
 assert.match(source,/useSWR<ContractorPayload>\('\/api\/carpeta-arranque'/);
 assert.match(source,/status === 'en_revision_l1'/);
 assert.match(source,/status === 'en_revision_l2'/);
 assert.match(source,/No hay carpetas en primera revisión/);
 assert.match(source,/No se pudo cargar la bandeja/);
});
test('work queue precedes secondary dashboard sections',()=>{
 assert.ok(source.indexOf('Qué debes resolver') < source.indexOf('Evidencia regulatoria por conciliar'));
});
