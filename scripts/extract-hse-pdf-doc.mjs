#!/usr/bin/env node
/**
 * Read-only MOTIL HSE extraction. Run on a trusted worker with poppler-utils
 * (pdfinfo, pdftotext) and antiword installed. Persistence is disabled; this entry point only performs GET requests.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const MOTIL_ORIGIN='https://ttlptyheuqeotadtcbaw.supabase.co';
function abort(category,code){
 console.log(JSON.stringify({scope:'motil_hse',mode:'dry_run',audit_status:category,error_code:code,source_count:null,documents:[]}));
 process.exit(category==='configuration_error'?78:3);
}
if(process.env.HSE_STAGE_FRAGMENTS && process.env.HSE_STAGE_FRAGMENTS!=='0')abort('configuration_error','PERSISTENCE_DISABLED');
const rawUrl=(process.env.SUPABASE_URL||'').trim();
const KEY=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
if(!rawUrl)abort('configuration_error','SUPABASE_URL_MISSING');
if(!KEY)abort('configuration_error','SUPABASE_SERVICE_ROLE_KEY_MISSING');
let parsed;
try{parsed=new URL(rawUrl);}catch{abort('configuration_error','SUPABASE_URL_INVALID');}
if(parsed.origin!==MOTIL_ORIGIN || parsed.username || parsed.password || !['','/'].includes(parsed.pathname) || parsed.search || parsed.hash)abort('configuration_error','SUPABASE_PROJECT_NOT_ALLOWED');
if(KEY.startsWith('sb_publishable_'))abort('configuration_error','PRIVILEGED_KEY_REQUIRED');
// JWT claims are a local consistency check, not signature verification. The API authenticates below.
if(!KEY.startsWith('sb_secret_')){
 let claims;
 try{claims=JSON.parse(Buffer.from(KEY.split('.')[1],'base64url').toString());}catch{abort('configuration_error','SERVICE_KEY_INVALID');}
 if(claims.role!=='service_role' || claims.ref!=='ttlptyheuqeotadtcbaw')abort('configuration_error','SERVICE_KEY_PROJECT_OR_ROLE_INVALID');
 if(claims.exp && claims.exp*1000<=Date.now())abort('configuration_error','SERVICE_KEY_EXPIRED');
}
const URL_ROOT=MOTIL_ORIGIN;
const headers=KEY.startsWith('sb_secret_')?{apikey:KEY}:{apikey:KEY,Authorization:'Bearer '+KEY};
async function request(path){
 let res;
 try{res=await fetch(URL_ROOT+path,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw Error('SUPABASE_NETWORK_ERROR');}
 if(!res.ok)throw Error(res.status===401||res.status===403?'SUPABASE_AUTHORIZATION_FAILED':'SUPABASE_HTTP_'+res.status);
 return res;
}
// Authenticate and check read access before invoking any document reader.
try{await request('/rest/v1/module_documents?select=id&limit=0');}
catch(e){abort(e.message==='SUPABASE_AUTHORIZATION_FAILED'?'configuration_error':'infrastructure_error',e.message);}
if(process.argv.includes('--preflight')){console.log(JSON.stringify({scope:'motil_hse',mode:'dry_run',audit_status:'configuration_validated'}));process.exit(0);}
const docs=[];
try {
for(let offset=0;offset<1000;offset+=100){
 const query=new URLSearchParams({select:'id,organization_id,file_path',file_path:'like.prevencion/documentos-hse/%',order:'file_path.asc,id.asc',offset:String(offset),limit:'100'});
 const page=await (await request('/rest/v1/module_documents?'+query)).json();
 docs.push(...page);if(page.length<100)break;
}
}catch(e){abort(e.message==='SUPABASE_AUTHORIZATION_FAILED'?'configuration_error':'infrastructure_error',e.message.startsWith('SUPABASE_')?e.message:'DOCUMENT_LIST_INVALID');}
if(docs.length===1000)abort('infrastructure_error','SOURCE_LIMIT_REACHED');
const selected=docs.filter(d=>d.organization_id && /\.(pdf|doc)$/i.test(d.file_path));
const directory=await mkdtemp(join(tmpdir(),'motil-hse-'));
const results=[];

try {
 for(const doc of selected){
  const ext=doc.file_path.toLowerCase().endsWith('.pdf')?'pdf':'doc';
  const item={source_document_id:doc.id,format:ext,status:'failed',pages:[],source_sha256:null,fragments:0};
  try {
   const path=doc.file_path.split('/').map(encodeURIComponent).join('/');
   const content=Buffer.from(await (await request('/storage/v1/object/module-documents/'+path)).arrayBuffer());
   if(content.length>12*1024*1024)throw Error('source exceeds 12MB');
   const file=join(directory,doc.id+'.'+ext);
   await writeFile(file,content,{mode:0o600});
   item.source_sha256=createHash('sha256').update(content).digest('hex');
   let text='';
   if(ext==='pdf'){
    try { const output=await exec('pdftotext',['-layout',file,'-'],{maxBuffer:16*1024*1024,timeout:45000}); text=output.stdout; } catch {text='';}
   }else{
    try { const output=await exec('antiword',[file],{maxBuffer:16*1024*1024,timeout:45000}); text=output.stdout; } catch {text='';}
   }
   let method='native';
   if (!text.trim() && ext==='doc') {
     const converted=join(directory,doc.id+'.txt');
     try {
       await exec('libreoffice',['-env:UserInstallation=file://'+join(directory,'lo-'+doc.id),'--headless','--convert-to','txt:Text (encoded):UTF8','--outdir',directory,file],{timeout:45000,maxBuffer:1024*1024});
       text=await readFile(converted,'utf8');
       method='libreoffice';
     } catch { /* Preserve original document and flag if no reader succeeds. */ }
   }
   if (!text.trim() && ext==='pdf') {
     const prefix=join(directory,doc.id+'-scan');
     const info=await exec('pdfinfo',[file],{timeout:12000,maxBuffer:1024*1024});
     const count=Number(info.stdout.match(/^Pages:\s*(\d+)/m)?.[1]||0);
     if(count<1||count>120)throw Error('OCR page count outside 1..120');
     const output=[];
     for(let page=1;page<=count;page++){
       const p=prefix+'-'+page;
       await exec('pdftoppm',['-f',String(page),'-l',String(page),'-r','300','-gray','-singlefile','-png',file,p],{timeout:30000,maxBuffer:1024*1024});
       const image=p+'.png';
       const ocr=await exec('tesseract',[image,'stdout','-l','spa+eng','--psm','3'],{timeout:40000,maxBuffer:8*1024*1024});
       let extracted=ocr.stdout;
       if(!extracted.trim()){
         const alt=await exec('tesseract',[image,'stdout','-l','spa+eng','--psm','11'],{timeout:40000,maxBuffer:8*1024*1024});
         extracted=alt.stdout;
       }
       output.push(extracted);
       await rm(image,{force:true});
     }
     text=output.join(String.fromCharCode(12));
     method='ocr_tesseract_spa_eng';
   }
   item.extraction_method=method;
   const segments=ext==='pdf'?text.split(String.fromCharCode(12)): [text];
   for(let page=0;page<segments.length;page++){
    const raw=segments[page].replace(/\r\n/g,'\n').trim();
    if(!raw)continue;
    const chunks=raw.match(/[\s\S]{1,3000}/g)||[];
    for(let i=0;i<chunks.length;i++){
     const fragment=chunks[i];
     const fragment_sha256=createHash('sha256').update(fragment).digest('hex');
     item.pages.push({page:ext==='pdf'?page+1:null,section:i+1,sha256:fragment_sha256,characters:fragment.length});

    }
   }
   item.fragments=item.pages.length;
   item.review_reasons=[];
   if(!item.fragments)item.review_reasons.push('NO_TEXT_EXTRACTED');
   if(ext==='pdf'){
    const actual=segments.at(-1)===''?segments.slice(0,-1):segments;
    item.empty_pages=actual.flatMap((part,index)=>part.trim()?[]:[index+1]);
    if(item.empty_pages.length)item.review_reasons.push('PAGES_WITHOUT_TEXT');
   }
   item.status=item.fragments && !item.review_reasons.length?'extracted_preview':'needs_manual_review';
  }catch(e){if(e.message.startsWith('SUPABASE_'))item.status='source_access_failed';item.error_code=/^SUPABASE_(AUTHORIZATION_FAILED|NETWORK_ERROR|HTTP_[0-9]{3})$/.test(e.message)?e.message:'DOCUMENT_EXTRACTION_FAILED';}
  results.push(item);
 }
}finally{await rm(directory,{recursive:true,force:true});}
const counts={};
for(const item of results)counts[item.status]=(counts[item.status]||0)+1;
const complete=results.length>0 && results.every(x=>x.status==='extracted_preview');
console.log(JSON.stringify({scope:'motil_hse',mode:'dry_run',audit_status:complete?'completed':'review_required',source_count:selected.length,statuses:counts,documents:results},null,2));
if(!complete)process.exitCode=2;
