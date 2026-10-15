import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/actions/state/route.ts','utf8');
const source=fs.readFileSync('lib/maintenance/personal-work-order-inbox.ts','utf8');

test('personal work order read/snooze states require an exact canonical task match',()=>{
 assert.match(route,/^export async function POST\(request: NextRequest\)/m);
 assert.match(route,/loadPersonalMaintenanceTasks\(/);
 assert.match(route,/^\s*if \(!task && \/\^work_order:/m);
 assert.match(route,/personal\.find\(\(item\) => item\.task_key === sourceKey\)/);
 assert.match(route,/if \(authorized\) task = \{ task_key: authorized\.task_key, severity: authorized\.severity \}/);
 assert.match(route,/if \(!task\) \{\s*return NextResponse\.json\(\{ error: 'La acción ya no está disponible para tu cargo' \}/);
 assert.match(route,/status === 'snoozed' && String\(task\.severity \|\| ''\)\.toLowerCase\(\) === 'critical'/);
 assert.match(route,/\.eq\('organization_id', context\.organizationId\)/);
 assert.match(route,/\.eq\('user_id', context\.userId\)/);
 assert.match(source,/\.eq\('assigned_person_id', person.id\)/);
 assert.match(source,/workshopHeadCanAccessOrder\(workshop, order\)/);
 assert.match(source,/\.eq\('organization_id', context.organizationId\)/);
});

test('reject arbitrary task keys and do not convert personal preference into work-order mutation',()=>{
 assert.match(route,/if \(!sourceKey \|\| !\['pending', 'read', 'snoozed'\]\.includes\(status\)\)/);
 assert.match(route,/\.from\('user_action_states'\)\.upsert/);
 assert.doesNotMatch(route,/\.from\('maintenance_work_orders'\)\.update/);
});
