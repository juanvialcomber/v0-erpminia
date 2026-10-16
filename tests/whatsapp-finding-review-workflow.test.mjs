import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  sourceIdsOfFinding, canReviewFinding, reviewedFinding,
  canRecordOperationalFinding, validOperationalClassification,
} from '../lib/messages/whatsapp-finding-review.mjs';

const read = (path) => readFileSync(new URL('../' + path,import.meta.url),'utf8');
const exists = (path) => existsSync(new URL('../' + path,import.meta.url));
const finding = {
  domain:'maintenance', detail:'Cambio de aceite a chancador', source_ids:[1661,2081],
  review_status:'pending',
};

test('source IDs stay exact, deduplicated, bounded and positive',()=>{
  assert.deepEqual(sourceIdsOfFinding({source_ids:[1661,1661,2081,'1661',-1,1.5,Infinity]}),[1661,2081]);
  assert.deepEqual(sourceIdsOfFinding({source_ids:[1,2,3,4]},2),[1,2]);
  assert.deepEqual(sourceIdsOfFinding({}),[]);
});

test('human source review is append-only and cannot certify a physical completion',()=>{
  const before=JSON.stringify(finding);
  const uncertain=reviewedFinding(finding,'needs_more_info','Solicitar parte de turno completo',
    'auth-user-1','2026-10-16T12:00:00.000Z');
  assert.equal(uncertain.review_status,'needs_more_info');
  assert.equal(uncertain.review_history.length,1);
  assert.equal(JSON.stringify(finding),before);
  assert.equal(canReviewFinding(uncertain,'confirmed'),true);
  const approved=reviewedFinding(uncertain,'confirmed','Verificado contra el mensaje original',
    'auth-user-2','2026-10-16T12:01:00.000Z');
  assert.equal(approved.review_history.length,2);
  assert.equal(canReviewFinding(approved,'dismissed'),false);
  assert.equal(canRecordOperationalFinding(approved),true);
  assert.equal(canRecordOperationalFinding({...approved,operational_log_id:'some-id'}),false);
  assert.throws(()=>reviewedFinding(approved,'dismissed','Ya confirmada evidencia',
    'auth-user','2026-10-16T12:01:00.000Z'),/finding_review_locked/);
  assert.throws(()=>reviewedFinding(finding,'confirmed','corto','auth','2026-10-16T12:00:00Z'),
    /review_note_required/);
});

test('operations scope and category must be human-confirmed and coherent',()=>{
  assert.equal(validOperationalClassification('plant','plant_intervention','reported_done'),true);
  assert.equal(validOperationalClassification('plant','cleaning','pending'),true);
  assert.equal(validOperationalClassification('dispatch','dispatch_coordination','planned'),true);
  assert.equal(validOperationalClassification('plant','dispatch_coordination','pending'),false);
  assert.equal(validOperationalClassification('dispatch','plant_intervention','pending'),false);
  assert.equal(validOperationalClassification('machines','plant_intervention','reported_done'),false);
  assert.equal(validOperationalClassification('plant','cleaning','completed'),false);
});

test('review and operational APIs enforce admin role, tenant source IDs and CAS',()=>{
  const review=read('app/api/admin/whatsapp/findings/route.ts');
  const operational=read('app/api/admin/whatsapp/operational-log/route.ts');
  assert.match(review,/requireAdmin\(request\)/);
  assert.match(review,/\.eq\('organization_id', auth\.organizationId\)/);
  assert.match(review,/\.eq\('updated_at', resolved\.report\.updated_at\)/);
  assert.match(review,/sourceIdsOfFinding\(resolved\.finding\)/);
  assert.match(review,/reviewedFinding\(resolved\.finding, decision, note/);
  assert.match(review,/resolved\.report\.status !== 'ready'/);
  assert.match(operational,/requireAdmin\(request\)/);
  assert.match(operational,/\.eq\('organization_id',auth\.organizationId\)/);
  assert.match(operational,/validOperationalClassification\(scope,category,reportedState\)/);
  assert.match(operational,/motil_whatsapp_record_operational_finding/);
  assert.match(operational,/p_organization_id:auth\.organizationId/);
  assert.doesNotMatch(operational,/maintenance_work_orders|work_order_events/);
});

test('atomic plant log RPC checks reviewed source, stores reported (not verified) state and deduplicates',()=>{
  const sql=read('supabase/migrations/20261016131500_motil_whatsapp_operational_log.sql');
  assert.match(sql,/create table if not exists public\.motil_whatsapp_operational_log/);
  assert.match(sql,/unique\(organization_id, report_id, finding_index\)/);
  assert.match(sql,/for update/);
  assert.match(sql,/report_row\.status <> 'ready'/);
  assert.match(sql,/finding ->> 'review_status' <> 'confirmed'/);
  assert.match(sql,/where m\.organization_id = p_organization_id and m\.id=any\(ids\)/);
  assert.match(sql,/source_message_ids bigint\[\]/);
  assert.match(sql,/reported_state text not null/);
  assert.match(sql,/finding_already_recorded_differently/);
  assert.match(sql,/recorded_by uuid not null/);
  assert.match(sql,/grant execute on function public\.motil_whatsapp_record_operational_finding/);
  assert.match(sql,/to service_role/);
  assert.match(sql,/alter table public\.motil_whatsapp_operational_log enable row level security/);
  assert.doesNotMatch(sql,/update public\.maintenance_work_orders|insert into public\.work_order_events/);
  assert.doesNotMatch(sql,/update public\.production_plant_shifts|update public\.production_metallurgy_results/);
});

test('UI routes plant activities into operational log rather than machinery maintenance orders',()=>{
  const ui=read('components/whatsapp/whatsapp-finding-review.tsx');
  const admin=read('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(ui,/Corroborar contenido/);
  assert.match(ui,/Ámbito de operación/);
  assert.match(ui,/Estado expresado en el mensaje/);
  assert.match(ui,/Registrar en bitácora operacional/);
  assert.match(ui,/\/api\/admin\/whatsapp\/operational-log/);
  assert.match(ui,/confirmedClassification/);
  assert.match(admin,/WhatsappFindingReview/);
  assert.doesNotMatch(ui,/\/dashboard\/mantenimiento\/ordenes-trabajo/);
  assert.doesNotMatch(ui,/\/api\/admin\/whatsapp\/work-orders/);
  assert.equal(exists('app/api/admin/whatsapp/findings/apply/route.ts'),false);
  assert.equal(exists('app/api/admin/whatsapp/work-orders/route.ts'),false);
  assert.equal(exists('supabase/migrations/20261016121000_motil_whatsapp_verified_finding_to_ot.sql'),false);
});

test('AI briefing separates plant interventions, dispatch, and machinery OT from text',()=>{
  const daily=read('app/api/cron/whatsapp-daily/route.ts');
  assert.match(daily,/plant_operations\|plant_intervention\|plant_process\|dispatch\|machine_maintenance/);
  assert.match(daily,/NUNCA como OT de maquinaria/);
  assert.match(daily,/reported_state: reported_done\|pending\|planned\|unclear/);
  assert.match(daily,/review_status:'pending'/);
  assert.doesNotMatch(daily,/maintenance_work_orders'\)\.update/);
});
