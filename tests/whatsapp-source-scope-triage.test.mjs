import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('cached report redaction from main #531 is preserved on admin overview and every new read path', () => {
  const overview=read('app/api/admin/whatsapp/route.ts');
  const triage=read('app/api/admin/whatsapp/triage/route.ts');
  const finding=read('app/api/admin/whatsapp/findings/route.ts');
  const page=read('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(overview,/redactDisallowedWhatsappReports/);
  assert.match(triage,/redactDisallowedWhatsappReports/);
  assert.match(triage,/scopeStale:scopedReport\.source_scope_stale/);
  assert.match(triage,/!scopedReport\.source_scope_stale/);
  assert.match(finding,/redactDisallowedWhatsappReports/);
  assert.match(finding,/scoped\?\.source_scope_stale/);
  assert.match(finding,/\.eq\('enabled',true\)\.in\('id', groupIds\)/);
  assert.match(page,/!r\.source_scope_stale && whatsappReviewEnabled && r\.status === 'ready'/);
  assert.match(page,/Fuentes deshabilitadas · Resumen oculto/);
});

test('original message, multimedia, operational log and RPC deny excluded or disabled source groups',()=>{
  const detail=read('app/api/admin/whatsapp/triage/message/route.ts');
  const files=read('app/api/admin/whatsapp/evidence/[id]/route.ts');
  const operational=read('app/api/admin/whatsapp/operational-log/route.ts');
  const migration=read('supabase/migrations/20261016131500_motil_whatsapp_operational_log.sql');
  assert.match(detail,/\.eq\('enabled',true\)\.maybeSingle\(\)/);
  assert.match(detail,/isExcludedMotilWhatsappGroup\(group\.chat_id\)/);
  assert.match(files,/\.eq\('enabled',true\)\.maybeSingle\(\)/);
  assert.match(operational,/\.containedBy\('source_group_ids',ids\)/);
  assert.match(operational,/isExcludedMotilWhatsappGroup\(g\.chat_id\)/);
  assert.match(migration,/g\.enabled=true/);
  assert.match(migration,/g\.chat_id <> '120363427917216825@g\.us'/);
  assert.doesNotMatch(detail,/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
});

test('history and new group discovery preserve the excluded maintenance chat protection',()=>{
  const scope=read('lib/messages/greenapi-group-scope.ts');
  const api=read('app/api/admin/whatsapp/route.ts');
  const webhook=read('app/api/integrations/greenapi/webhook/route.ts');
  assert.match(scope,/120363427917216825@g\.us/);
  assert.match(api,/isExcludedMotilWhatsappGroup\(chatId\)/);
  assert.match(webhook,/isExcludedMotilWhatsappGroup\(chatId\)/);
});
