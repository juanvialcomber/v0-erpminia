import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('evidence schema is private, tenant scoped and tied to the exact source message',()=>{
 const m=read('supabase/migrations/20261015142500_motil_whatsapp_evidence_media.sql');
 assert.match(m,/message_id bigint not null unique references public\.motil_whatsapp_messages/);
 assert.match(m,/foreign key \(group_id,organization_id\)/);
 assert.match(m,/message_id bigint not null unique/);
 assert.match(m,/on conflict \(message_id\) do nothing/);
 assert.match(m,/enable row level security/);
 assert.match(m,/revoke all on public\.motil_whatsapp_attachments from public,anon,authenticated/);
 assert.match(m,/motil-whatsapp-evidence','motil-whatsapp-evidence',false/);
 assert.match(m,/for update of a skip locked/);
 assert.match(m,/g\.enabled\s*=\s*true/);
});

test('media worker uses Green API DownloadFile contract, signed HTTPS-only hosts and bounded reads',()=>{
 const s=read('lib/messages/greenapi-media.ts');
 assert.match(s,/greenRequest\('downloadFile', \{/);
 assert.match(s,/chatId: job\.source_chat_id, idMessage: job\.source_provider_id/);
 assert.match(s,/MAX_BYTES = 12 \* 1024 \* 1024/);
 assert.match(s,/response\.body\.getReader\(\)/);
 assert.match(s,/redirect: 'manual'/);
 assert.match(s,/untrusted_media_host/);
 assert.match(s,/storage\.from\(BUCKET\)\.upload/);
 assert.match(s,/createHash\('sha256'\)/);
 assert.match(s,/upsert: false/);
 assert.doesNotMatch(s,/sendMessage|sendText|sendFileByUrl/);
});

test('image and PDF extraction is review-only and does not auto-create operational facts',()=>{
 const s=read('lib/messages/greenapi-media.ts');
 assert.match(s,/type: 'input_image'/);
 assert.match(s,/type: 'input_file'/);
 assert.match(s,/written a mano|escritos a mano/i);
 assert.match(s,/no adivines/i);
 assert.match(s,/store:false/);
 assert.match(s,/review_status: 'pending'/);
 assert.match(s,/needs_human_review: true/);
 assert.doesNotMatch(s,/maintenance_work_orders|production_runs|hse_incidents/);
});

test('private media and vision crons require CRON_SECRET and do not modify inbox',()=>{
 const proxy=read('proxy.ts');
 const schedule=JSON.parse(read('vercel.json')).crons;
 for (const name of ['whatsapp-media','whatsapp-vision']) {
  const route=read('app/api/cron/'+name+'/route.ts');
  assert.match(route,/process\.env\.CRON_SECRET/);
  assert.match(route,/authorization/);
  assert.match(proxy,new RegExp('\\/api\\/cron\\/'+name));
  if(name==='whatsapp-media') assert.ok(schedule.some(x=>x.path==='/api/cron/'+name));
  else assert.equal(schedule.some(x=>x.path==='/api/cron/'+name),false);
 }
});

test('incoming webhook and history parser preserve fileMessageData captions and names',()=>{
 assert.match(read('app/api/integrations/greenapi/webhook/route.ts'),/data\.fileMessageData/);
 const require=createRequire(import.meta.url);
 const ts=require('typescript');
 const transpiled=ts.transpileModule(read('lib/messages/greenapi-history.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS}
 }).outputText;
 const x={exports:{}};
 runInNewContext(transpiled,{exports:x.exports,Date});
 const group={id:'example',organization_id:'tenant',chat_id:'123456789@g.us'};
 const row={type:'incoming',chatId:group.chat_id,idMessage:'ABC',timestamp:1700000000,
   typeMessage:'imageMessage',fileMessageData:{caption:'Planilla de turno',
   fileName:'image.jpg',downloadUrl:'https://sw-media.storage.greenapi.net/image.jpg'}};
 const normalized=x.exports.historyMessage(row,group);
 assert.equal(normalized.body,'Planilla de turno');
 assert.equal(normalized.file_name,'image.jpg');
 assert.equal(normalized.provider_message_id,'ABC');
});

test('only specific trusted media domains can be downloaded',()=>{
 const require=createRequire(import.meta.url);
 const ts=require('typescript');
 const transpiled=ts.transpileModule(read('lib/messages/greenapi-media.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const x={exports:{}};
 runInNewContext(transpiled,{
  exports:x.exports,
  require(name){
    if(name==='./greenapi-host') return {greenApiOrigin:()=> 'https://7107.api.greenapi.com'};
    if(name==='./greenapi') return {greenDb:()=>{},greenRequest:()=>{}};
    return require(name);
  },
  URL,process:{env:{GREENAPI_API_URL:'https://7107.api.greenapi.com'}},Buffer,
 });
 const check=x.exports.isTrustedGreenMediaUrl;
 assert.equal(check('https://sw-media.storage.greenapi.net/media.png'),true);
 assert.equal(check('https://sw-media.storage.yandexcloud.net/media.png'),true);
 assert.equal(check('https://7107.api.greenapi.com/media.png'),true);
 assert.equal(check('http://7107.api.greenapi.com/media.png'),false);
 assert.equal(check('https://evil.example/media.png'),false);
 assert.equal(check('https://7107.api.greenapi.com.attacker.invalid/payload'),false);
 assert.equal(check('https://user:password@sw-media.storage.greenapi.net/media.png'),false);
});

test('admin cannot launch a globally scoped media batch',()=>{
 const admin=read('app/api/admin/whatsapp/route.ts');
 assert.doesNotMatch(admin,/body\?\.action === 'download-one'/);
 assert.doesNotMatch(admin,/downloadGreenApiEvidenceBatch/);
});

test('provider diagnostics never print signed media URL or source message ID', () => {
 const src=read('lib/messages/greenapi-media.ts');
 assert.match(src,/provider missing downloadUrl/);
 assert.match(src,/provider media host rejected/);
 assert.match(src,/Object\.keys\(result\)\.slice\(0, 8\)/);
 assert.match(src,/new URL\(downloadUrl\)\.hostname/);
 assert.doesNotMatch(src,/console\.(?:log|warn|error)\(\s*(?:result|downloadUrl)\s*[,)]/);
 const schedule=JSON.parse(read('vercel.json')).crons;
 const job=schedule.find(x=>x.path==='/api/cron/whatsapp-media');
 assert.equal(job.schedule,'1,6,11,16,21,26,31,36,41,46,51,56 * * * *');
});
