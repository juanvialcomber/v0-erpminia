import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261108114000_route_vacant_operational_roles_to_operations_manager.sql', import.meta.url);

test('vacant plant and drilling owner tasks fall back only to an active operations manager', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /t\.domain in \('plant','drilling'\)/);
  assert.match(sql, /p\.status='active'/);
  assert.match(sql, /upper\(fallback\.name\)='GERENTE DE OPERACIONES'/);
  assert.match(sql, /not exists[\s\S]*p\.cargo_id=t\.cargo_id/);
  assert.match(sql, /exists[\s\S]*p\.cargo_id=fallback\.id/);
});

test('fallback is self-healing and does not rewrite the source operational task', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /La tarea vuelve automáticamente al cargo original cuando tenga un perfil activo/);
  assert.match(sql, /from public\.operational_tasks_by_cargo_v9 t/);
  assert.doesNotMatch(sql, /update\s+public\.operational_tasks_by_cargo_v9/i);
});
