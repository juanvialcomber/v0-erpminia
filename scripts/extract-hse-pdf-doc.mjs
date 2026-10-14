#!/usr/bin/env node
/**
 * Read-only MOTIL HSE extraction. Run on a trusted worker with poppler-utils
 * (pdfinfo, pdftotext) and antiword installed. Stages pending fragments only when HSE_STAGE_FRAGMENTS=1.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const URL_ROOT=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!URL_ROOT.startsWith('https://ttlptyheuqeotadtcbaw.supabase.co')||!KEY) throw Error('MOTIL-only service credentials required');
const headers={apikey:KEY,Authorization:'Bearer '+KEY};
async function request(path){
 const res=await fetch(URL_ROOT+path,{headers});
 if(!res.ok)throw Error('Supabase HTTP '+res.status);
 return res;
}
const docs=[];
for(let offset=0;offset<1000;offset+=100){
 const query=new URLSearchParams({select:'id,organization_id,file_path',file_path:'like.prevencion/documentos-hse/%',order:'file_path.asc',offset:String(offset),limit:'100'});
 const page=await (await request('/rest/v1/module_documents?'+query)).json();
 docs.push(...page);if(page.length<100)break;
}
const selected=docs.filter(d=>d.organization_id && /\.(pdf|doc)$/i.test(d.file_path));
const directory=await mkdtemp(join(tmpdir(),'motil-hse-'));
const results=[];
const staged=[];
const stageEnabled=process.env.HSE_STAGE_FRAGMENTS==='1';
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
       await exec('libreoffice',['-env:UserInstallation=file:///tmp/hse-lo-'+doc.id,'--headless','--convert-to','txt:Text (encoded):UTF8','--outdir',directory,file],{timeout:45000,maxBuffer:1024*1024});
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
     text=output.join('\\f');
     method='ocr_tesseract_spa_eng';
   }
   item.extraction_method=method;
   const segments=ext==='pdf'?text.split('\\f'): [text];
   for(let page=0;page<segments.length;page++){
    const raw=segments[page].replace(/\r\n/g,'\n').trim();
    if(!raw)continue;
    const chunks=raw.match(/[\s\S]{1,3000}/g)||[];
    for(let i=0;i<chunks.length;i++){
     const fragment=chunks[i];
     const fragment_sha256=createHash('sha256').update(fragment).digest('hex');
     item.pages.push({page:ext==='pdf'?page+1:null,section:i+1,sha256:fragment_sha256,characters:fragment.length});
     if(stageEnabled)staged.push({
       source_document_id:doc.id,source_sha256:item.source_sha256,
       page_number:ext==='pdf'?page+1:null,section_number:i+1,
       extraction_method:method,fragment_text:fragment,fragment_sha256
     });
    }
   }
   item.fragments=item.pages.length;
   item.status=item.fragments?'extracted_preview':'needs_manual_review';
  }catch(e){item.error=String(e.message||e).slice(0,180);}
  results.push(item);
 }
}finally{await rm(directory,{recursive:true,force:true});}
const complete=results.length===78 && results.every(x=>x.status==='extracted_preview');
if(stageEnabled && complete){
 for(let start=0;start<staged.length;start+=100){
   const res=await fetch(URL_ROOT+'/rest/v1/rpc/stage_hse_document_fragments',{
     method:'POST',headers:{...headers,'Content-Type':'application/json'},
     body:JSON.stringify({p_rows:staged.slice(start,start+100)})
   });
   if(!res.ok)throw Error('HSE staging RPC failed HTTP '+res.status);
 }
}
console.log(JSON.stringify({scope:'motil_hse',mode:stageEnabled?'staging':'dry_run',source_count:selected.length,documents:results},null,2));
if(!complete)process.exitCode=1;
