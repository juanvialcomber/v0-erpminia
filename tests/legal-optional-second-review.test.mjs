import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('app/api/carpeta-arranque/[id]/review/route.ts','utf8');
const ui=readFileSync('components/prevention/carpeta-arranque-list.tsx','utf8');
test('Legal explicitly chooses whether second review is needed',()=>{
 assert.match(api,/typeof requireSecondReview !== 'boolean'/);
 assert.match(api,/requireSecondReview \? 'en_revision_l2' : 'aprobado'/);
 assert.match(ui,/Solicitar segunda aprobación/);
 assert.match(ui,/checked=\{requireSecondReview\}/);
});
test('incomplete or rejected documents are not directly approved',()=>{
 assert.match(api,/anyL1NoCumple \? 'rechazado'/);
 assert.match(api,/uploadedDocs\.length > 0 && uploadedDocs\.every/);
});
