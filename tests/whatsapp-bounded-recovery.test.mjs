import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, ORG, GROUP, eligible, trustedMedia, recoverOne, signature, limitedBytes } from '../scripts/recover-whatsapp-evidence.mjs';

const run='recovery-20261027-authorized-01';
const bytes=Buffer.from([255,216,255,1,2,3,4,5,6,7,8,9,10]);
const row=()=>({id:IDS[0],organization_id:ORG,group_id:GROUP,provider_message_id:'exact-source',
  download_status:'unsupported',download_attempts:1,message_type:'imageMessage',updated_at:'2026-10-26T00:00:00Z',
  extraction_json:{portero:{fingerprint:'old',source_date:null},other:'preserve'}});
function fixture(overrides={}) {
  const patches=[]; let calls=0;
  const io={assertGroup:async()=>{},patch:async(r,p)=>{patches.push(p);return {...r,...p};},
    download:async()=>{calls++;return {downloadUrl:'https://sw-media.storage.greenapi.net/instance/file.jpg'};},
    fetchBytes:async()=>bytes,preserve:async()=>{},readOriginal:async()=>bytes,...overrides};
  return {io,patches,calls:()=>calls};
}
test('only exact bounded tenant/group/IDs and terminal downloads qualify',()=>{
  assert.equal(IDS.length,9); assert.equal(eligible(row(),run),true);
  for (const patch of [{id:'other'},{organization_id:'other'},{group_id:'other'},
    {download_status:'pending'},{storage_path:'already'},{download_lease_until:'2099-01-01T00:00:00Z'},
    {extraction_json:{recovery:{run_id:run}}}]) assert.equal(eligible({...row(),...patch},run),false);
});
test('host checks reject SSRF, credentials, wildcard subdomains and insecure URLs',()=>{
  assert.equal(trustedMedia('https://do-media-7107.fra1.digitaloceanspaces.com/a'),true);
  for (const url of ['http://sw-media.storage.greenapi.net/a','https://sw-media.storage.greenapi.net.evil.test/a',
    'https://user@sw-media.storage.greenapi.net/a','https://127.0.0.1/a','not a url']) assert.equal(trustedMedia(url),false);
});
test('stored state requires byte hash readback; old counters and unrelated metadata preserved',async()=>{
  const f=fixture(),r=await recoverOne(row(),f.io,run),p=f.patches.at(-1);
  assert.equal(r.status,'stored_verified');assert.equal(f.calls(),1);
  assert.equal(p.download_status,'stored');assert.equal(p.scan_status,'manual');
  assert.equal(Object.hasOwn(p,'download_attempts'),false);assert.equal(p.extraction_json.other,'preserve');
  assert.equal(p.extraction_json.portero.source_date,null);assert.equal(p.extraction_json.portero.canonical_approved,false);
  assert.equal(p.extraction_json.portero.work_state,'human_review');
  assert.equal(p.extraction_json.recovery.previous_handover.fingerprint,'old');
});
test('HTTP200 provider error string does not trigger media fetch or retries',async()=>{
  const f=fixture({download:async()=>({downloadUrl:'File unavailable'}),fetchBytes:async()=>assert.fail('must not fetch')});
  const r=await recoverOne(row(),f.io,run);assert.equal(r.code,'invalid_download_response');
  assert.equal(f.patches.at(-1).download_status,undefined);assert.equal(f.patches.at(-1).extraction_json.portero.fingerprint,'old');
});
test('untrusted provider host is diagnosed without downloading or weakening hosts',async()=>{
  const f=fixture({download:async()=>({downloadUrl:'https://evil.test/a'}),fetchBytes:async()=>assert.fail('must not fetch')});
  const r=await recoverOne(row(),f.io,run);assert.equal(r.code,'untrusted_media_host');assert.equal(r.media_host,'evil.test');
});
test('hash mismatch never marks original recovered',async()=>{
  const f=fixture({readOriginal:async()=>Buffer.from('wrong')});
  const r=await recoverOne(row(),f.io,run);assert.equal(r.code,'storage_hash_mismatch');
  assert.equal(f.patches.some(p=>p.download_status==='stored'),false);
});
test('same run and changed lease prevent another provider call',async()=>{
  const f=fixture();const r=await recoverOne({...row(),extraction_json:{recovery:{run_id:run}}},f.io,run);
  assert.equal(r.status,'skipped');assert.equal(f.calls(),0);assert.equal(f.patches.length,0);
  const g=fixture({patch:async()=>null});assert.equal((await recoverOne(row(),g.io,run)).status,'concurrent_change');assert.equal(g.calls(),0);
});
test('group disabled between download and upload prevents storing',async()=>{
  let checks=0;const f=fixture({assertGroup:async()=>{if (++checks===2) throw new Error('group_not_enabled');},
    preserve:async()=>assert.fail('must not preserve')});
  assert.equal((await recoverOne(row(),f.io,run)).code,'group_not_enabled');
});
test('type signature and stream size are verified independently of extensions',async()=>{
  assert.throws(()=>signature(bytes,'videoMessage'),/unsupported_media_signature/);
  await assert.rejects(limitedBytes(new Response(bytes,{headers:{'content-length':String(13*1024*1024)}})),/media_too_large/);
});
