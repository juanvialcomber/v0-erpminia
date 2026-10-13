import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const review=readFileSync('app/api/carpeta-arranque/[id]/review/route.ts','utf8');
const route=readFileSync('app/api/carpeta-arranque/route.ts','utf8');
const layout=readFileSync('app/dashboard/legal/layout.tsx','utf8');
test('review requires server-side Legal EECC or HSE edit access',()=>{
 assert.match(review,/MODULE_KEYS\.LEGAL_EECC/);
 assert.match(review,/legalAccess !== 'ED' && hseAccess !== 'ED'/);
});
test('read and create are separately authorized',()=>{
 assert.match(route,/legalAccess === 'SR' && hseAccess === 'SR'/);
 assert.match(route,/legalAccess !== 'ED' && hseAccess !== 'ED'/);
});
test('contractor paperwork is reachable from Legal',()=>{
 assert.match(layout,/label: 'Contratistas · Documentos'/);
});

test('rejected folders cannot bypass contractor correction and resubmission',()=>{
 assert.match(review,/level === 1 && !\['en_revision_l1', 'pendiente'\]\.includes\(carpeta\.status\)/);
});
