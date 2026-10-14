#!/usr/bin/env node
/**
 * Read-only MOTIL HSE extraction. Run on a trusted worker with poppler-utils
 * (pdfinfo, pdftotext) and antiword installed. No writes to Supabase.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
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
    const output=await exec('pdftotext',['-layout',file,'-'],{maxBuffer:16*1024*1024,timeout:45000});
    text=output.stdout;
   }else{
    const output=await exec('antiword',[file],{maxBuffer:16*1024*1024,timeout:45000});
    text=output.stdout;
   }
   const segments=ext==='pdf'?text.split('\f'): [text];
   for(let page=0;page<segments.length;page++){
    const raw=segments[page].replace(/\r\n/g,'\n').trim();
    if(!raw)continue;
    const chunks=raw.match(/[\s\S]{1,3000}/g)||[];
    for(let i=0;i<chunks.length;i++){
     const fragment=chunks[i];
     item.pages.push({page:ext==='pdf'?page+1:null,section:i+1,sha256:createHash('sha256').update(fragment).digest('hex'),characters:fragment.length});
    }
   }
   item.fragments=item.pages.length;
   item.status=item.fragments?'extracted_preview':'empty_or_scanned_review';
  }catch(e){item.error=String(e.message||e).slice(0,180);}
  results.push(item);
 }
}finally{await rm(directory,{recursive:true,force:true});}
console.log(JSON.stringify({scope:'motil_hse',mode:'dry_run',source_count:selected.length,documents:results},null,2));
if(results.length!==78 || results.some(x=>x.status==='failed'))process.exitCode=1;
