import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Green API route is exposed through proxy but requires independent token',()=>{
  const proxy=read('proxy.ts'), route=read('app/api/integrations/greenapi/webhook/route.ts');
  assert.match(proxy,/\/api\/integrations\/greenapi\/webhook/);
  assert.match(proxy,/\/api\/cron\/whatsapp-daily/);
  assert.match(route,/validWebhookToken/);
  assert.match(route,/incomingMessageReceived/);
  assert.match(route,/not_enabled/);
  assert.match(route,/group_id,provider_message_id/);
  assert.doesNotMatch(route,/maintenance_work_orders/);
});
test('Group controls are admin-only and provider membership verified before enabling',()=>{
  const route=read('app/api/admin/whatsapp/route.ts');
  assert.match(route,/requireAdmin/);
  assert.match(route,/getChats/);
  assert.match(route,/c\.id===chatId/);
  assert.match(route,/organization_id!==ctx.organizationId/);
  assert.match(route,/if \(!body\.enabled\)/);
  assert.match(route,/\.eq\('organization_id',ctx\.organizationId\)/);
  assert.match(route,/during provider outages/);
  assert.match(route,/reportError/);
});
test('Daily intelligence preserves traceability and is non-canonical',()=>{
  const cron=read('app/api/cron/whatsapp-daily/route.ts');
  const sql=read('supabase/migrations/20261014233000_motil_whatsapp_group_intake.sql');
  assert.match(cron,/CRON_SECRET/);
  assert.match(cron,/source_ids/);
  assert.match(cron,/claim_daily_report/);
  assert.match(sql,/America\/Santiago/);
  assert.match(sql,/unique \(group_id, provider_message_id\)/);
  assert.match(sql,/service_role/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/unique \(instance_id, chat_id\)/);
  assert.match(sql,/foreign key \(group_id, organization_id\)/);
});

test('Webhook accepts either supported secret header and limits encoded payload bytes',()=>{
  const route=read('app/api/integrations/greenapi/webhook/route.ts');
  assert.match(route,/Bearer\\s\+/);
  assert.match(route,/x-greenapi-token/);
  assert.match(route,/some\(\(token\) => validWebhookToken\(token\)\)/);
  assert.match(route,/TextEncoder\(\)\.encode\(raw\)\.byteLength/);
  assert.match(route,/onConflict: 'group_id,provider_message_id', ignoreDuplicates: true/);
});

test('Daily report remains a human-review summary and scopes evidence to an organization',()=>{
  const cron=read('app/api/cron/whatsapp-daily/route.ts');
  const sql=read('supabase/migrations/20261014233000_motil_whatsapp_group_intake.sql');
  assert.match(cron,/review_status:'pending'/);
  assert.match(cron,/p_organization_id:organizationId/);
  assert.match(sql,/m\.organization_id = p_organization_id/);
  assert.match(sql,/g\.enabled = true/);
});
