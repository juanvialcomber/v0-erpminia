import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('PR #531 exclusions remain in admin discovery, evidence and webhook after integration',()=>{
  const admin=file('app/api/admin/whatsapp/route.ts');
  const evidence=file('app/api/admin/whatsapp/evidence/[id]/route.ts');
  const webhook=file('app/api/integrations/greenapi/webhook/route.ts');
  const ui=file('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(admin,/redactDisallowedWhatsappReports/);
  assert.match(admin,/filter\(group => group.enabled && !isExcludedMotilWhatsappGroup\(group.chat_id\)\)/);
  assert.match(admin,/allowedDiscovered/);
  assert.match(admin,/isExcludedMotilWhatsappGroup\(chatId\)/);
  assert.match(evidence,/\.eq\('enabled',true\)\.maybeSingle\(\)/);
  assert.match(webhook,/isExcludedMotilWhatsappGroup\(chatId\)/);
  assert.match(ui,/source_scope_stale/);
  assert.match(ui,/Fuentes deshabilitadas · Resumen oculto/);
  assert.match(ui,/!r\.source_scope_stale && whatsappReviewEnabled && r\.status === 'ready'/);
});

test('direct triage endpoint strips stale reports and refuses unvalidated group allowlists',()=>{
  const api=file('app/api/admin/whatsapp/triage/route.ts');
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(api,/\.select\('enabled,updated_at,chat_id'\)/);
  assert.match(api,/sourceGroups\.length >= 100/);
  assert.match(api,/group\.enabled && isExcludedMotilWhatsappGroup\(group.chat_id\)/);
  assert.match(api,/redactDisallowedWhatsappReports\(\[report\]/);
  assert.match(api,/!scopedReport\.source_scope_stale/);
  assert.match(api,/motil_whatsapp_daily_evidence/);
  assert.doesNotMatch(api,/\.insert\(|\.update\(|\.upsert\(/);
});

test('direct review checks exact source authorization for both read and confirmation',()=>{
  const api=file('app/api/admin/whatsapp/findings/route.ts');
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(api,/redactDisallowedWhatsappReports\(\[report\]/);
  assert.match(api,/groupScope\.length >= 100/);
  assert.match(api,/group\.enabled && isExcludedMotilWhatsappGroup\(group\.chat_id\)/);
  assert.match(api,/\.eq\('enabled',true\)\.in\('id', groupIds\)/);
  assert.match(api,/activeGroups\|\|\[\]\)\.some\(group=>isExcludedMotilWhatsappGroup\(group\.chat_id\)\)/);
  assert.match(api,/\.eq\('updated_at', resolved\.report\.updated_at\)/);
});

test('full-message drilldown and operational-log reads exclude disabled groups',()=>{
  const source=file('app/api/admin/whatsapp/triage/message/route.ts');
  const log=file('app/api/admin/whatsapp/operational-log/route.ts');
  assert.match(source,/requireAdmin\(request\)/);
  assert.match(source,/localDay\(new Date\(message\.occurred_at\)\)!==date/);
  assert.match(source,/\.eq\('enabled',true\)\.maybeSingle\(\)/);
  assert.match(source,/isExcludedMotilWhatsappGroup\(group\.chat_id\)/);
  assert.match(log,/requireAdmin\(request\)/);
  assert.match(log,/\.containedBy\('source_group_ids',ids\)/);
  assert.match(log,/\.eq\('enabled',true\)\.limit\(51\)/);
  assert.match(log,/isExcludedMotilWhatsappGroup\(g\.chat_id\)/);
  assert.doesNotMatch(log,/maintenance_work_orders|work_order_events/);
});

test('database gate blocks previously reviewed data after authorization changed',()=>{
  const migration=file('supabase/migrations/20261016131500_motil_whatsapp_operational_log.sql');
  assert.match(migration,/select \* into report_row from public\.motil_whatsapp_daily_reports/);
  assert.match(migration,/for update/);
  assert.match(migration,/g\.updated_at > report_row\.generated_at/);
  assert.match(migration,/raise exception 'source_scope_stale'/);
  assert.match(migration,/raise exception 'excluded_source_enabled'/);
  assert.match(migration,/g\.enabled=true/);
  assert.match(migration,/g\.chat_id <> '120363427917216825@g\.us'/);
  assert.match(migration,/raise exception 'source_messages_missing_or_disabled'/);
  assert.match(migration,/unique\(organization_id, report_id, finding_index\)/);
  assert.doesNotMatch(migration,/insert into public\.maintenance_work_orders|update public\.maintenance_work_orders/);
  assert.doesNotMatch(migration,/update public\.production_plant_shifts|update public\.production_metallurgy_results/);
  assert.match(migration,/to service_role/);
});
