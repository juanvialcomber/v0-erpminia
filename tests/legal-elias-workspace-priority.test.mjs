import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/dashboard/legal/page.tsx','utf8');
test('Legal home loads real first-review and second-signature queues',()=>{
 assert.match(source,/useSWR<ContractorPayload>\('\/api\/carpeta-arranque'/);
 assert.match(source,/status === 'en_revision_l1'/);
 assert.match(source,/status === 'en_revision_l2'/);
 assert.match(source,/No se pudo actualizar la bandeja/);
});
test('daily work precedes support tools',()=>{
 assert.ok(source.indexOf('Qué necesita atención') < source.indexOf('Herramientas y áreas de soporte'));
});
