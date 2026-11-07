import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('app/dashboard/legal/page.tsx','utf8');
const coverage=readFileSync('app/api/legal/eecc-coverage/route.ts','utf8');

test('Legal home loads current-month supplier coverage',()=>{
 assert.match(source,/\/api\/legal\/eecc-coverage/);
 assert.match(source,/coverage\.summary\.in_review/);
 assert.match(source,/coverage\.summary\.without_folder/);
 assert.match(coverage,/compliance_period/);
 assert.match(coverage,/currentPeriod/);
 assert.match(coverage,/in_review/);
});

test('daily work precedes support tools',()=>{
 assert.ok(source.indexOf('Prioridad') < source.indexOf('Herramientas y áreas de soporte'));
});
