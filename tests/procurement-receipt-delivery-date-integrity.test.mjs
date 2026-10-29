import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20261029175000_fix_procurement_receipt_delivery_date.sql', 'utf8');

test('full operational receipt persists actual delivery date from receipt evidence', () => {
  assert.match(migration, /actual_delivery_date = case/);
  assert.match(migration, /min\(r\.received_at\)::date/);
  assert.match(migration, /when v_fully_received then 'received'/);
});

test('historical repair is bounded to received or closed orders with real receipts', () => {
  assert.match(migration, /o\.actual_delivery_date is null/);
  assert.match(migration, /o\.status in \('received','closed'\)/);
  assert.match(migration, /from public\.procurement_operational_receipts/);
  assert.doesNotMatch(migration, /expected_delivery_date[^\n]*actual_delivery_date/);
});

test('partial receipts do not fabricate an actual delivery date', () => {
  assert.match(migration, /else o\.actual_delivery_date/);
});