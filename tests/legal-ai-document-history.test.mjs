import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const analyze=readFileSync('app/api/legal/asistente/analyze-document/route.ts','utf8');
const history=readFileSync('app/api/legal/asistente/history/route.ts','utf8');
const migration=readFileSync('supabase/migrations/20261013010000_legal_ai_document_reviews.sql','utf8');
const ui=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
test('AI reviews are versioned and must be audited before success',()=>{
 assert.match(analyze,/createHash\('sha256'\)/);
 assert.match(analyze,/legal_ai_document_reviews'\)\.insert/);
 assert.match(analyze,/if\(auditError\|\|!audit\)/);
 assert.match(analyze,/pendiente_revision_humana/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all .* anon,authenticated/);
});
test('history enforces legal RBAC, tenant and contractor checks',()=>{
 assert.match(history,/requireModuleAccess\(request,MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(history,/organization_id',access\.organizationId/);
 assert.match(history,/Fuera de organización/);
 assert.match(ui,/Historial documental/);
});
