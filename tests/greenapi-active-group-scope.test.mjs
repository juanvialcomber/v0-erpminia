import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const transpiled=stripTypeScriptTypes(read('lib/messages/greenapi-group-scope.ts'),{mode:'transform'});
const {redactDisallowedWhatsappReports}=await import('data:text/javascript;base64,'+Buffer.from(transpiled).toString('base64'));

const sample={report_date:'2026-10-15',generated_at:'2026-10-16T09:30:00Z',status:'ready',
  message_count:49,summary:'Síntesis de Planta Patagua',findings:[{source_ids:[1661],detail:'Registro operacional'}],truncated:false};
const groups=[{enabled:true,updated_at:'2026-10-15T08:00:00Z'},
 {enabled:false,updated_at:'2026-10-15T19:00:00Z'}];

test('disabled group is not retroactively included in a newer report',()=>{
 const [result]=redactDisallowedWhatsappReports([sample],groups);
 assert.equal(result.source_scope_stale,false);
 assert.equal(result.message_count,49);
 assert.deepEqual(result.findings,sample.findings);
});
test('when group is disabled later, cached narrative and evidence are hidden',()=>{
 const [result]=redactDisallowedWhatsappReports([sample],[{enabled:false,updated_at:'2026-10-16T10:30:00Z'}]);
 assert.equal(result.source_scope_stale,true);
 assert.equal(result.status,'scope_changed');
 assert.equal(result.message_count,0);
 assert.deepEqual(result.findings,[]);
 assert(!result.summary.includes('Planta Patagua'));
 assert.equal(sample.findings.length,1);
});
test('uncertain change timestamp fails closed rather than expose source',()=>{
 const [result]=redactDisallowedWhatsappReports([sample],[{enabled:false,updated_at:null}]);
 assert.equal(result.source_scope_stale,true);
});
test('future Group 2 only participates when enabled, without hardcoding names',()=>{
 const [result]=redactDisallowedWhatsappReports([sample],[...groups,{enabled:true,updated_at:'2026-10-16T10:00:00Z'}]);
 assert.equal(result.source_scope_stale,false);
});

test('WhatsApp evidence list and detail enforce current enabled group boundary',()=>{
 const api=read('app/api/admin/whatsapp/route.ts');
 const detail=read('app/api/admin/whatsapp/evidence/[id]/route.ts');
 assert.match(api,/activeGroupIds/);
 assert.match(api,/\.filter\(group => group\.enabled && !isExcludedMotilWhatsappGroup\(group\.chat_id\)\)/);
 assert.match(api,/\.in\('group_id',activeGroupIds\)/);
 assert.match(api,/redactDisallowedWhatsappReports/);
 assert.match(detail,/\.eq\('enabled',true\)\.maybeSingle\(\)/);
 assert.ok(detail.indexOf('if(!approvedGroup)')<detail.indexOf("searchParams.get('file')"));
});
test('intake and daily report already require explicit active group authorization',()=>{
 const webhook=read('app/api/integrations/greenapi/webhook/route.ts');
 const daily=read('app/api/cron/whatsapp-daily/route.ts');
 const history=read('lib/messages/greenapi-history-sync.ts');
 assert.match(webhook,/if \(!group\?\.enabled\)/);
 assert.match(daily,/\.eq\('enabled', true\)/);
 assert.match(history,/\.eq\('enabled', true\)/);
});

test('excluded maintenance chat is hidden from discovery and blocked on save',()=>{
 const scope=read('lib/messages/greenapi-group-scope.ts');
 const api=read('app/api/admin/whatsapp/route.ts');
 assert.match(scope,/120363427917216825@g\.us/);
 assert.match(api,/isExcludedMotilWhatsappGroup\(chatId\)/);
 assert.match(api,/allowedDiscovered/);
});
test('legacy group IDs are accepted end to end rather than rejected by database',()=>{
 const migration=read('supabase/migrations/20261016172500_motil_whatsapp_legacy_group_ids.sql');
 const webhook=read('app/api/integrations/greenapi/webhook/route.ts');
 assert.match(migration,/\[0-9\]\{5,20\}-\[0-9\]\{1,20\}/);
 assert.match(webhook,/isGreenApiGroupId\(chatId\)/);
 assert.match(webhook,/isExcludedMotilWhatsappGroup\(chatId\)/);
});

test('save identifies missing legacy-ID migration instead of a generic error',()=>{
 const source=read('app/api/admin/whatsapp/route.ts');
 assert.match(source,/error\.code === '23514'/);
 assert.match(source,/WHATSAPP_SCHEMA_OUTDATED/);
 assert.match(source,/Falta desplegar la migración/);
 assert.match(source,/GROUP_TENANT_CONFLICT/);
 assert.match(source,/GROUP_SAVE_FAILED/);
});
