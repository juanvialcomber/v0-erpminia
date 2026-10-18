import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as calendar from '../lib/maintenance/work-order-calendar-date.mjs';

const compiledRoute = ts.transpileModule(
  readFileSync(new URL('../app/api/maintenance/preventive/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Execute the actual GET handler with read-only database fixtures. No network,
// credentials, mutations or operational records are available to these tests.
function loadRoute(schedules) {
  const reads = [];
  const rows = {
    preventive_maintenance_schedules: schedules,
    maintenance_assets: [],
    maintenance_operation_task_candidates_v1: [],
    preventive_maintenance_hour_status_v1: [],
    maintenance_work_orders: [],
  };
  const supabase = {
    from(table) {
      assert.ok(Object.hasOwn(rows, table), `Unexpected table: ${table}`);
      const read = { table, filters: [] };
      reads.push(read);
      const query = {
        select() { return query; },
        eq(column, value) { read.filters.push([column, value]); return query; },
        order() { return query; },
        not() { return query; },
        then(resolve, reject) { return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject); },
      };
      return query;
    },
  };
  const dependencies = {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => ({ ok: true, organizationId: 'lab-calendar-fixture', supabase }),
    },
    '@/lib/api/module-access': {
      MODULE_KEYS: { MANT_OPERACIONES: 'maintenance' },
      requireModuleAccess: async () => ({ authorized: true }),
    },
    '@/lib/maintenance/workshop-site-scope': {},
    '@/lib/maintenance/work-order-calendar-date.mjs': calendar,
  };
  const exports = {};
  runInNewContext(compiledRoute, {
    exports,
    Date,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return { get: exports.GET, reads };
}

function schedule(id, nextDate, extra = {}) {
  return { id, asset_id: 'fixture-asset', next_scheduled_date: nextDate, enabled: true, generated_work_order_id: null, ...extra };
}

function restoreTimezone(t) {
  const original = process.env.TZ;
  t.after(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
}

test('preventive GET uses the same Chilean day on UTC, Santiago and Bangkok servers', async (t) => {
  restoreTimezone(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-19T01:30:00Z').getTime() });
  const schedules = [
    schedule('yesterday', '2026-10-17'),
    schedule('today', '2026-10-18'),
    schedule('tomorrow', '2026-10-19'),
    schedule('day-30', '2026-11-17'),
    schedule('day-31', '2026-11-18'),
    schedule('undated', null, { enabled: false }),
    schedule('invalid', '2026-02-29', { generated_work_order_id: 'fixture-order' }),
  ];

  for (const timezone of ['UTC', 'America/Santiago', 'Asia/Bangkok']) {
    process.env.TZ = timezone;
    const { get, reads } = loadRoute(schedules);
    const response = await get({});
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.summary, { total: 7, overdue: 1, dueSoon: 3, disabled: 1, generated: 1 }, timezone);
    assert.equal(payload.schedules.length, schedules.length, 'Unscheduled and invalid rows remain visible for review');
    assert.equal(reads.length, 5);
    for (const read of reads) {
      assert.ok(read.filters.some(([key, value]) => key === 'organization_id' && value === 'lab-calendar-fixture'));
    }
  }
});

test('preventive GET handles Chilean daylight-saving boundaries without advancing the operational day', async (t) => {
  restoreTimezone(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-04-05T03:30:00Z').getTime() });
  const cases = [
    { now: '2026-04-05T03:30:00Z', yesterday: '2026-04-03', today: '2026-04-04', tomorrow: '2026-04-05' },
    { now: '2026-09-06T03:30:00Z', yesterday: '2026-09-04', today: '2026-09-05', tomorrow: '2026-09-06' },
    { now: '2026-09-06T04:30:00Z', yesterday: '2026-09-05', today: '2026-09-06', tomorrow: '2026-09-07' },
  ];

  for (const { now, yesterday, today, tomorrow } of cases) {
    t.mock.timers.setTime(new Date(now).getTime());
    for (const timezone of ['UTC', 'America/Santiago']) {
      process.env.TZ = timezone;
      const { get } = loadRoute([
        schedule('yesterday', yesterday), schedule('today', today), schedule('tomorrow', tomorrow),
      ]);
      const response = await get({});
      const payload = await response.json();
      assert.deepEqual(payload.summary, { total: 3, overdue: 1, dueSoon: 2, disabled: 0, generated: 0 }, `${now} in ${timezone}`);
    }
  }
});
