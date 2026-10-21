import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/maintenance/whatsapp/review-decisions/route.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../app/dashboard/mantenimiento/whatsapp-revision/page.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261021020000_motil_whatsapp_review_decisions.sql', import.meta.url), 'utf8');

test('decision endpoint scopes reads and writes to organization and reviewer', () => {
  assert.match(route, /requireModuleAccess/);
  assert.match(route, /roles\.has/);
  assert.match(route, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(route, /reviewer_id: context\.userId/);
  assert.match(route, /operational_publication: false/);
});
test('review decisions are persisted outside canonical operational activities', () => {
  assert.match(route, /\.from\('motil_whatsapp_review_decisions'\)/);
  assert.doesNotMatch(route, /\.from\('motil_whatsapp_operational_activities'\)/);
  assert.match(migration, /unique \(organization_id,message_id,item_index\)/);
  assert.match(migration, /enable row level security/);
});
test('screen only offers review and discard, not operational publication', () => {
  assert.match(screen, /Revisado para/);
  assert.match(screen, /Descartar propuesta/);
  assert.match(screen, /review-decisions/);
});
