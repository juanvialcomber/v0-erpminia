import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lineage = readFileSync('supabase/migrations/20261106171500_document_intake_entity_lineage.sql','utf8');
const transport = readFileSync('supabase/migrations/20261106173000_transport_settlements_canonical_view.sql','utf8');

test('document intake lineage is tenant scoped and promotion explicit', () => {
  assert.match(lineage, /document_intake_entity_links/);
  assert.match(lineage, /organization_id uuid not null references public\.organizations/);
  assert.match(lineage, /intake_item_id uuid not null references public\.document_intake_items/);
  assert.match(lineage, /promotion_status in \('candidate','reviewed','promoted','rejected'\)/);
  assert.match(lineage, /enable row level security/);
  assert.match(lineage, /current_application_user_id\(\)/);
});

test('canonical transport projection only exposes promoted source lineage', () => {
  assert.match(transport, /transport_settlements_canonical_v1/);
  assert.match(transport, /relation_type='derived_from'/);
  assert.match(transport, /promotion_status='promoted'/);
  assert.match(transport, /security_invoker=true/);
  assert.match(transport, /transport_settlement_components_canonical_v1/);
});

test('legacy duplicate transport rows remain auditable but rejected from canonical projection', () => {
  assert.match(transport, /relation_type[^\n]*'supersedes'/);
  assert.match(transport, /'rejected'/);
  assert.match(transport, /Legacy duplicate superseded/);
});
