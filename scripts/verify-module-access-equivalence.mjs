// Explicit, read-only runtime gate. Never runs in build, CI, or the default test suite.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadModuleAccess, plain } from '../tests/helpers/module-access.mjs';

if (process.env.MOTIL_PERMISSION_AUDIT_APPROVED !== '1') {
  throw new Error('Explicit approval required: set MOTIL_PERMISSION_AUDIT_APPROVED=1 only after approval.');
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase runtime configuration is required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const kernel = loadModuleAccess(db);

async function readAll(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from(table).select(columns).order('id').range(offset, offset + 499);
    if (error) throw new Error(`Read failed: ${table} (${error.code})`);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
const profiles = await readAll('profiles', 'id,cargo_id');
let assigned = 0;
const cargos = new Set();
for (const profile of profiles) {
  let expected = { hasCargo: false, cargoId: null, cargoName: null, access: {} };
  if (profile.cargo_id) {
    assigned++;
    cargos.add(profile.cargo_id);
    const [matrix, cargo] = await Promise.all([
      db.from('role_matrix').select('module_key,access_level').eq('cargo_id', profile.cargo_id),
      db.from('cargos').select('name').eq('id', profile.cargo_id).maybeSingle(),
    ]);
    if (matrix.error || cargo.error) throw new Error('Independent reference lookup failed');
    expected = { hasCargo: true, cargoId: profile.cargo_id, cargoName: cargo.data?.name || null,
      access: Object.fromEntries(matrix.data.map(row => [row.module_key, row.access_level])) };
  }
  const actual = plain(await kernel.getUserModuleAccess(profile.id));
  // Do not print private identity or grants on failure.
  try { assert.deepEqual(actual, expected); }
  catch { throw new Error('Permission equivalence failed; stop rollout and investigate (no private data logged)'); }
}
if (profiles.length === 0 || cargos.size < 2) throw new Error('Insufficient coverage: require profiles from at least two distinct cargos');
console.log(JSON.stringify({ equivalent: true, profiles: profiles.length, assignedProfiles: assigned, distinctCargos: cargos.size }));
