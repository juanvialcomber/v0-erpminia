import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const personal = readFileSync('lib/maintenance/personal-work-order-inbox.ts','utf8');
const inbox = readFileSync('app/api/actions/inbox/route.ts','utf8');

test('planner inbox is exception-driven instead of mirroring every created OT',()=>{
  assert.match(personal,/Created OTs stay in the weekly plan unless they become a real exception/);
  assert.match(personal,/order\.status === 'in_progress'.*dateKey && dateKey < now/s);
  assert.match(personal,/maintenance_planning:overdue_not_started/);
  assert.match(personal,/OT vencida\$\{overdue\.length === 1 \? '' : 's'\} sin iniciar/);
  assert.match(personal,/Revisar vigencia del plan y reprogramar sólo si la fecha ya no corresponde/);
  assert.doesNotMatch(personal,/for \(const order of created\) \{\s*tasks\.set\(order\.id, toInboxTask/s);
});

test('planner exceptions are owned actions without implying personal execution',()=>{
  assert.match(personal,/responsibility: 'owner'/);
  assert.match(personal,/Siguen siendo trabajo planificado; revisar vigencia de fecha y reprogramar sólo si corresponde/);
  assert.match(personal,/Intervenir atraso/);
});

test('general OTs without an asset do not become false missing-asset planner tasks',()=>{
  assert.match(inbox,/missingAssetSupportIds/);
  assert.match(inbox,/work_type,canonical_asset_id/);
  assert.match(inbox,/String\(order\.work_type \|\| ''\)\.toLowerCase\(\) === 'general'/);
  assert.match(inbox,/ignorableIds/);
});

test('grouped overdue planning task routes to the EAM planning view',()=>{
  assert.match(inbox,/kind === 'maintenance_planning'/);
  assert.match(inbox,/\/dashboard\/mantenimiento\/eam/);
});
