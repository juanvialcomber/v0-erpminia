import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleAccess, responseClient, plain } from './helpers/module-access.mjs';

const profile = (level = 'ED') => ({ cargo_id: 'cargo-a', cargos: {
  name: 'Supervisor', role_matrix: [{ module_key: 'mant_operaciones', access_level: level }],
} });
const denied = { hasCargo: false, cargoId: null, cargoName: null, access: {} };

for (const level of ['ED', 'LEC', 'SR']) {
  for (const write of [false, true]) {
    test(`${level} ${write ? 'write' : 'read'} authorization follows the cargo matrix`, async () => {
      const { client } = responseClient({ data: profile(level), error: null });
      const result = await loadModuleAccess(client).requireModuleAccess({}, 'mant_operaciones', write);
      const allowed = level === 'ED' || (level === 'LEC' && !write);
      assert.equal(result.authorized, allowed);
      assert.equal(result.canWrite, level === 'ED');
      assert.equal(result.accessLevel, level);
      assert.equal(result.response?.status ?? null, allowed ? null : 403);
    });
  }
}

test('missing module denies access even when other modules allow editing', async () => {
  const { client } = responseClient({ data: profile(), error: null });
  const result = await loadModuleAccess(client).requireModuleAccess({}, 'fin_compras');
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 403);
});

test('unsigned requests return 401 before any permission query', async () => {
  const { client, calls } = responseClient({ data: profile(), error: null });
  const result = await loadModuleAccess(client, null).requireModuleAccess({}, 'mant_operaciones');
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 401);
  assert.equal(calls.length, 0);
});

for (const role of ['admin', 'superadmin', 'super_admin']) {
  test(`trusted ${role} bypass remains unchanged`, async () => {
    const { client, calls } = responseClient({ data: null, error: null });
    assert.equal(await loadModuleAccess(client).getModuleAccessLevel('user-a', role, 'fin_compras'), 'ED');
    assert.equal(calls.length, 0);
  });
}

for (const [label, data, error] of [
  ['missing profile', null, null],
  ['unassigned cargo', { cargo_id: null, cargos: null }, null],
  ['missing relation', { cargo_id: 'cargo-a', cargos: null }, null],
  ['empty relation', { cargo_id: 'cargo-a', cargos: [] }, null],
  ['database error with partial grants', profile(), { code: '42501' }],
  ['relationship/schema error', null, { code: 'PGRST200' }],
]) {
  test(`${label} fails closed`, async () => {
    const { client } = responseClient({ data, error });
    const kernel = loadModuleAccess(client);
    assert.deepEqual(plain(await kernel.getUserModuleAccess('user-a')), denied);
    const result = await kernel.requireModuleAccess({}, 'mant_operaciones', true);
    assert.equal(result.authorized, false);
    assert.equal(result.response.status, 403);
  });
}

test('empty matrix and invalid grant values never authorize', async () => {
  for (const rows of [[], [{ module_key: 'mant_operaciones', access_level: 'ADMIN' }]]) {
    const data = profile(); data.cargos.role_matrix = rows;
    const { client } = responseClient({ data, error: null });
    assert.equal(await loadModuleAccess(client).getModuleAccessLevel('user-a', 'worker', 'mant_operaciones'), 'SR');
  }
});

test('cargo separation, one request per lookup, and immediate revocation', async () => {
  const profiles = { 'user-a': profile('ED'), 'user-b': profile('LEC') };
  profiles['user-b'].cargo_id = 'cargo-b';
  profiles['user-b'].cargos.name = 'Reader';
  const { client, calls } = responseClient(call => {
    assert.equal(call.table, 'profiles');
    assert.equal(call.filter[0], 'id');
    assert.equal(call.columns, 'cargo_id,cargos!profiles_cargo_id_fkey(name,role_matrix!role_matrix_cargo_id_fkey(module_key,access_level))');
    return { data: profiles[call.filter[1]], error: null };
  });
  const kernel = loadModuleAccess(client);
  assert.equal(await kernel.getModuleAccessLevel('user-a', 'worker', 'mant_operaciones'), 'ED');
  assert.equal(await kernel.getModuleAccessLevel('user-b', 'worker', 'mant_operaciones'), 'LEC');
  profiles['user-a'].cargos.role_matrix = [];
  assert.equal(await kernel.getModuleAccessLevel('user-a', 'worker', 'mant_operaciones'), 'SR');
  assert.equal(calls.length, 3);
});

test('transport rejection never returns an authorization', async () => {
  const { client } = responseClient(() => { throw new Error('network unavailable'); });
  await assert.rejects(loadModuleAccess(client).requireModuleAccess({}, 'mant_operaciones'), /network unavailable/);
});

// Independent oracle for the former three-read resolver on valid FK-backed records.
test('optimized resolver equals independent cargo lookup for every module and grant level', async () => {
  const cargos = [
    { id: 'cargo-a', name: 'Editor' }, { id: 'cargo-b', name: 'Reader' }, { id: 'cargo-c', name: 'Empty' },
  ];
  const rows = [
    { cargo_id: 'cargo-a', module_key: 'mant_operaciones', access_level: 'ED' },
    { cargo_id: 'cargo-a', module_key: 'fin_compras', access_level: 'SR' },
    { cargo_id: 'cargo-b', module_key: 'mant_operaciones', access_level: 'LEC' },
    { cargo_id: 'cargo-b', module_key: 'fin_compras', access_level: 'ED' },
  ];
  for (const cargoId of ['cargo-a', 'cargo-b', 'cargo-c', null]) {
    const cargo = cargos.find(c => c.id === cargoId);
    const ownRows = rows.filter(r => r.cargo_id === cargoId);
    const expected = cargoId ? { hasCargo: true, cargoId, cargoName: cargo.name,
      access: Object.fromEntries(ownRows.map(r => [r.module_key, r.access_level])) } : denied;
    const { client } = responseClient({ data: { cargo_id: cargoId,
      cargos: cargo ? { name: cargo.name, role_matrix: ownRows } : null }, error: null });
    const kernel = loadModuleAccess(client);
    assert.deepEqual(plain(await kernel.getUserModuleAccess('user-a')), expected);
    for (const key of ['mant_operaciones', 'fin_compras', 'fin_finanzas']) {
      assert.equal(await kernel.getModuleAccessLevel('user-a', 'worker', key), expected.access[key] ?? 'SR');
    }
  }
});
