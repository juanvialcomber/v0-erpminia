import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const session = readFileSync('lib/subcontractor-session.ts', 'utf8');
test('subcontractor cookies can never be issued unsigned',()=> {
 assert.match(session,/throw new Error\('Subcontractor session signing key is not configured'\)/);
 assert.doesNotMatch(session,/return JSON\.stringify\(payload\)/);
});
test('unsigned legacy cookies and malformed token shapes fail closed',()=> {
 assert.match(session,/if \(!secret\) return null;/);
 assert.match(session,/token\.split\('\.'\)\.length !== 2/);
 assert.doesNotMatch(session,/legacyPayload/);
});
test('initial password rule remains unchanged',()=>{
 assert.match(session,/return `lapatagua\$\{lastFour\}`/);
});
