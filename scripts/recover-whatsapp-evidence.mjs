import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { planPorteroHandover } from '../lib/intake/portero.mjs';

export const ORG = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
export const GROUP = '119b9b1c-99c8-4001-9140-b2b6f06c79e2';
const INSTANCE = '710722691570';
const CHAT = '120363403264951041@g.us';
const BASE = 'https://ttlptyheuqeotadtcbaw.supabase.co';
const BUCKET = 'motil-whatsapp-evidence';
const MAX = 12 * 1024 * 1024;
export const IDS = Object.freeze([
  'e315e5c3-c035-4bf9-b45a-6be8730cd04a','5a62abdb-edc8-4426-aab7-9e8b630b275a',
  '8a550af1-78e7-4d30-a0f5-949a1e95c2f2','9f6915c6-2dfb-404c-9e89-1be37a4bcaf7',
  '5b5d82e1-702d-43d0-a658-2fd335bd3116','7bded3d6-a8a3-402a-bb2e-8ed2c9118482',
  'a0f42809-a6be-4c9f-ac70-bd1647cb9590','2b204ed6-896f-4f7c-a04d-dde778eff462',
  'a9e9ea76-3180-46ce-9031-83da037af149',
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function trustedMedia(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      ['sw-media.storage.greenapi.net','sw-media.storage.yandexcloud.net',
        'do-media-7107.fra1.digitaloceanspaces.com','api.green-api.com',
        'api.greenapi.com','7107.api.greenapi.com'].includes(u.hostname) && u.pathname.length > 1;
  } catch { return false; }
}
export function signature(b, type) {
  if (b.length < 12) throw new Error('media_empty');
  if (type === 'imageMessage' && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { mime:'image/jpeg', extension:'jpg' };
  if (type === 'imageMessage' && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return { mime:'image/png', extension:'png' };
  if (type === 'videoMessage' && b.toString('ascii',4,8) === 'ftyp')
    return { mime:'video/mp4', extension:'mp4' };
  throw new Error('unsupported_media_signature');
}
export async function limitedBytes(r) {
  if (!r.ok || !r.body) throw new Error(`media_http_${r.status}`);
  if (Number(r.headers.get('content-length') || 0) > MAX) throw new Error('media_too_large');
  const reader = r.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > MAX) throw new Error('media_too_large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks,size);
}
async function mediaBytes(url) {
  for (let hop=0; hop<3; hop++) {
    if (!trustedMedia(url)) throw new Error('untrusted_media_host');
    const r = await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    if ([301,302,303,307,308].includes(r.status)) {
      const location = r.headers.get('location'); if (!location) throw new Error('invalid_media_redirect');
      url = new URL(location,url).toString();
    } else return limitedBytes(r);
  }
  throw new Error('too_many_media_redirects');
}
export function eligible(row,runId,now=Date.now()) {
  return row.organization_id === ORG && row.group_id === GROUP && IDS.includes(row.id) &&
    !row.storage_path && ['unavailable','unsupported'].includes(row.download_status) &&
    row.extraction_json?.recovery?.run_id !== runId &&
    !(row.download_lease_until && Date.parse(row.download_lease_until)>now);
}
export async function recoverOne(row,io,runId) {
  if (!eligible(row,runId)) return {id:row.id,status:'skipped'};
  await io.assertGroup();
  const metadata=row.extraction_json || {}, started=new Date().toISOString();
  const recovery={run_id:runId,started_at:started,status:'running',previous:metadata.recovery || null,
    previous_handover:metadata.portero || null,method:'downloadFile',worker_attempts_before:row.download_attempts};
  const claimed=await io.patch(row,{download_lease_until:new Date(Date.now()+300000).toISOString(),
    extraction_json:{...metadata,recovery},updated_at:started});
  if (!claimed) return {id:row.id,status:'concurrent_change'};
  try {
    const response=await io.download(row.provider_message_id),url=response?.downloadUrl;
    recovery.response_fields=response && typeof response==='object' ? Object.keys(response).slice(0,8) : [];
    if (typeof url!=='string' || !URL.canParse(url)) throw new Error('invalid_download_response');
    recovery.media_host=new URL(url).hostname;
    if (!trustedMedia(url)) throw new Error('untrusted_media_host');
    const bytes=await io.fetchBytes(url),file=signature(bytes,row.message_type),sha=hash(bytes);
    const key=`${ORG}/${GROUP}/${row.id}.${file.extension}`;
    await io.assertGroup(); await io.preserve(key,bytes,file.mime);
    if (hash(await io.readOriginal(key))!==sha) throw new Error('storage_hash_mismatch');
    await io.assertGroup(); const completed=new Date().toISOString();
    const handover=planPorteroHandover({...metadata.portero,
      source_identity:`whatsapp:${GROUP}:${row.provider_message_id}`,source_version:sha,
      section:'production',owner_profile_id:'9d2efcfc-3f08-4871-93c2-7fd70695f888',
      owner_name:'Fernando Maldonado · Ingeniería y Planificación',work_state:'human_review',
      reason:'original_recovered_requires_review',scope:'Original preservado; contenido pendiente de revisión, sin promoción canónica',
      next_action:'Revisar la evidencia original de planta y derivar al formulario o registro correspondiente.',
      reopen_when:'Nueva versión de origen o decisión del responsable de Producción.',
      original_verified:true,extraction_verified:false,coverage:'original_only',evidence_count:1,
      source_date:metadata.portero?.source_date || null},metadata.portero,completed).handover;
    const saved=await io.patch(claimed,{storage_path:key,mime_type:file.mime,size_bytes:bytes.length,sha256:sha,
      download_status:'stored',download_error_code:null,download_lease_until:null,download_next_at:null,
      downloaded_at:completed,scan_status:'manual',scan_error_code:null,
      extraction_json:{...metadata,portero:handover,recovery:{...recovery,status:'stored_verified',
        completed_at:completed,sha256:sha,size_bytes:bytes.length}},updated_at:completed});
    if (!saved) throw new Error('storage_record_concurrent_change');
    return {id:row.id,status:'stored_verified',sha256:sha,size_bytes:bytes.length};
  } catch (error) {
    const code=/^[a-z_0-9]{1,80}$/.test(error.message || '') ? error.message : 'recovery_unavailable';
    const saved=await io.patch(claimed,{download_lease_until:null,extraction_json:{...metadata,
      recovery:{...recovery,status:'blocked',code,completed_at:new Date().toISOString()}},updated_at:new Date().toISOString()});
    return {id:row.id,status:saved?'blocked':'concurrent_change',code,media_host:recovery.media_host || null};
  }
}
async function main() {
  const args=process.argv.slice(2),runId=args[args.indexOf('--run-id')+1],env=process.env;
  if (!args.includes('--apply') || !args.includes('--run-id') || !/^[a-z0-9-]{12,80}$/.test(runId || ''))
    throw new Error('explicit_apply_and_run_id_required');
  if (env.VERCEL_ENV!=='preview') throw new Error('preview_execution_required');
  if (env.GREENAPI_ID_INSTANCE?.trim()!==INSTANCE) throw new Error('instance_mismatch');
  if (env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')!==BASE) throw new Error('project_mismatch');
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.GREENAPI_API_TOKEN_INSTANCE) throw new Error('credentials_missing');
  const api=new URL(env.GREENAPI_API_URL || '');
  if (api.origin!=='https://7107.api.greenapi.com' || api.pathname!=='/' || api.search || api.hash || api.username || api.password)
    throw new Error('provider_origin_mismatch');
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
  async function rest(path,options={}) {
    const r=await fetch(BASE+path,{...options,headers:{...headers,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)});
    if (!r.ok) throw new Error(`database_http_${r.status}`); return r.json();
  }
  async function assertGroup() {
    const r=await rest(`/rest/v1/motil_whatsapp_groups?id=eq.${GROUP}&organization_id=eq.${ORG}&instance_id=eq.${INSTANCE}&enabled=eq.true&select=id,chat_id`);
    if (r.length!==1 || r[0].chat_id!==CHAT) throw new Error('group_not_enabled');
  }
  await assertGroup();
  const rows=await rest(`/rest/v1/motil_whatsapp_attachments?id=in.(${IDS.join(',')})&organization_id=eq.${ORG}&group_id=eq.${GROUP}&select=*`);
  if (rows.length!==IDS.length) throw new Error('scope_incomplete');
  const io={assertGroup,patch:async(row,data)=>{
    const r=await rest(`/rest/v1/motil_whatsapp_attachments?id=eq.${row.id}&organization_id=eq.${ORG}&updated_at=eq.${encodeURIComponent(row.updated_at)}`,
      {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(data)});
    return r[0] || null;
  },download:async id=>{
    const r=await fetch(`${api.origin}/waInstance${INSTANCE}/downloadFile/${env.GREENAPI_API_TOKEN_INSTANCE}`,
      {method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({chatId:CHAT,idMessage:id}),signal:AbortSignal.timeout(25000)});
    if (!r.ok) throw new Error(`provider_http_${r.status}`); return r.json();
  },fetchBytes:mediaBytes,preserve:async(key,bytes,mime)=>{
    const r=await fetch(`${BASE}/storage/v1/object/${BUCKET}/${key}`,{method:'POST',redirect:'error',
      headers:{...headers,'Content-Type':mime,'x-upsert':'false','Cache-Control':'0'},body:bytes,signal:AbortSignal.timeout(25000)});
    if (!r.ok) {const b=await r.json().catch(()=>({}));
      if (![400,409].includes(r.status) || !/already exists|duplicate/i.test(b.message || b.error || '')) throw new Error(`storage_http_${r.status}`);}
  },readOriginal:async key=>limitedBytes(await fetch(`${BASE}/storage/v1/object/authenticated/${BUCKET}/${key}`,
    {headers,redirect:'error',signal:AbortSignal.timeout(25000)}))};
  const results=[];
  for (const row of rows) {
    const result=await recoverOne(row,io,runId); results.push(result);
    console.log(JSON.stringify({index:results.length,status:result.status,code:result.code,media_host:result.media_host}));
  }
  console.log(JSON.stringify({total:results.length,recovered:results.filter(r=>r.status==='stored_verified').length,
    blocked:results.filter(r=>r.status==='blocked').length,skipped:results.filter(r=>r.status==='skipped').length}));
  await mkdir('.recovery-result',{recursive:true});
  await writeFile('.recovery-result/index.html','<!doctype html><title>Recovery completed</title><p>Bounded recovery completed. Private records retain the audit.</p>');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(/^[a-z_0-9]+$/.test(error.message)?error.message:'recovery_failed');process.exitCode=1;});
