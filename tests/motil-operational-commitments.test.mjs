import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import typescript from 'typescript';

const api = readFileSync(resolve(process.cwd(), 'app/api/actions/commitments/route.ts'), 'utf8');
const ui = readFileSync(resolve(process.cwd(), 'components/actions/motil-commitments.tsx'), 'utf8');
const page = readFileSync(resolve(process.cwd(), 'app/dashboard/acciones/page.tsx'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261122150000_motil_operational_commitments.sql'), 'utf8');

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';
const TASK = '44444444-4444-4444-8444-444444444444';

function routeHarness({ role = 'viewer', actor = ACTOR, assignee = ACTOR, taskStatus = 'open', taskOrg = ORG } = {}) {
  const calls = [];
  const supabase = {
    from(table) {
      const query = {
        filters: {},
        updatePayload: null,
        select() { return this; },
        eq(key, val) { this.filters[key] = val; return this; },
        update(payload) { this.updatePayload = payload; return this; },
        async maybeSingle() {
          calls.push({ table, filters: { ...this.filters }, payload: this.updatePayload });
          if (this.filters.organization_id !== taskOrg || this.filters.id !== TASK) return { data: null, error: null };
          if (this.updatePayload) {
            if (this.filters.status !== taskStatus) return { data: null, error: null };
            return { data: { id: TASK, status: this.updatePayload.status }, error: null };
          }
          return { data: { id: TASK, assignee_profile_id: assignee, status: taskStatus }, error: null };
        },
      };
      return query;
    },
  };
  const module = { exports: {} };
  const transpiled = typescript.transpileModule(api, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'commitments-route.ts',
    reportDiagnostics: true,
  });
  assert.equal(transpiled.diagnostics.filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);
  runInNewContext(transpiled.outputText, {
    module, exports: module.exports,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json(payload, options = {}) { return { payload, status: options.status || 200 }; } } };
      if (name === '@/lib/api/organization-context') return { getOrganizationContext: async () => ({ ok: true, organizationId: ORG, userId: actor, role, supabase }) };
      throw new Error('Unexpected import ' + name);
    }, console, Date, Set,
  });
  const request = (status, note = '') => ({ json: async () => ({ id: TASK, status, note }) });
  return { PATCH: module.exports.PATCH, request, calls };
}

test('only the assigned profile can update a commitment in its organization', async () => {
  const other = routeHarness({ assignee: OTHER });
  const forbidden = await other.PATCH(other.request('in_progress'));
  assert.equal(forbidden.status, 403);
  assert.equal(other.calls.filter((call) => call.payload !== null).length, 0);

  const owner = routeHarness();
  const ok = await owner.PATCH(owner.request('in_progress'));
  assert.equal(ok.status, 200);
  const write = owner.calls.find((call) => call.payload !== null);
  assert.equal(write.filters.organization_id, ORG);
  assert.equal(write.filters.id, TASK);
  assert.equal(write.filters.status, 'open');
  assert.equal(write.payload.updated_by_profile_id, ACTOR);
});

test('closing or blocking requires a meaningful human explanation', async () => {
  const x = routeHarness();
  assert.equal((await x.PATCH(x.request('done'))).status, 400);
  assert.equal((await x.PATCH(x.request('blocked', 'bad'))).status, 400);
  assert.equal(x.calls.length, 0);
  const done = await x.PATCH(x.request('done', 'Conteo aprobado y evidencia adjunta'));
  assert.equal(done.status, 200);
});

test('completed work cannot be silently reopened by its owner, but can be by admin', async () => {
  const owner = routeHarness({ taskStatus: 'done' });
  assert.equal((await owner.PATCH(owner.request('in_progress'))).status, 409);
  const admin = routeHarness({ role: 'superadmin', taskStatus: 'done', assignee: OTHER });
  assert.equal((await admin.PATCH(admin.request('open'))).status, 200);
});

test('the new commitments are embedded in Mi trabajo without replacing source-derived tasks', () => {
  assert.match(page, /<MotilCommitments \/>/);
  assert.match(page, /<ActionsInbox locale=/);
  assert.match(ui, /\/api\/actions\/commitments\?scope=team/);
  assert.match(ui, /can_update/);
  assert.match(api, /const showTeam = isAdmin &&/);
  assert.match(api, /\.eq\('assignee_profile_id', ctx\.userId\)/);
});

test('storage is tenant-isolated, service-only, audited, and customer-specific data is not committed', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.motil_operational_commitments FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON public\.motil_operational_commitment_events FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /motil_track_operational_commitment/);
  assert.match(migration, /AFTER INSERT OR UPDATE/);
  assert.match(migration, /organization_id = NEW.organization_id/);
  assert.doesNotMatch(migration, /INSERT INTO public\.motil_operational_commitments\s*\(/);
  assert.doesNotMatch(api, /\.from\('warehouse_stock'\)/);
});


test('unapplied optional migration does not crash the existing operational inbox', () => {
  assert.match(api, /error\.code === '42P01'/);
  assert.match(api, /error\.code === 'PGRST205'/);
  assert.match(api, /feature_available: false/);
  assert.match(ui, /if \(data\?\.feature_available === false\) return null/);
});

test('role commitments link to the relevant existing operating workflow', () => {
  assert.match(ui, /physical_counts: '\/dashboard\/bodega\/verificar-stock'/);
  assert.match(ui, /ot_materials: '\/dashboard\/bodega\/materiales-mantenimiento'/);
  assert.match(ui, /ot_clock: '\/dashboard\/mantenimiento'/);
  assert.match(ui, /<Link href=\{taskModuleHref\(item\)\}>\{item\.source_reference\.endsWith\(':ot_clock'\)/);
  assert.match(ui, /Una revisión coordinada por Ariel/);
});

test('service role can audit changes but cannot delete commitments or modify prior audit events', () => {
  const immutable = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261122170000_motil_commitment_audit_immutability.sql'), 'utf8');
  assert.match(immutable, /REVOKE DELETE, TRUNCATE ON public\.motil_operational_commitments FROM service_role/);
  assert.match(immutable, /REVOKE UPDATE, DELETE, TRUNCATE ON public\.motil_operational_commitment_events FROM service_role/);
});
