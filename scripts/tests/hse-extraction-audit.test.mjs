import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const script=resolve('scripts/extract-hse-pdf-doc.mjs');
const root=mkdtempSync(join(tmpdir(),'hse-audit-test-'));
const key=['e30',Buffer.from(JSON.stringify({role:'service_role',ref:'ttlptyheuqeotadtcbaw'})).toString('base64url'),'FAKE_TEST_SIGNATURE'].join('.');
const env={...process.env,SUPABASE_URL:'https://ttlptyheuqeotadtcbaw.supabase.co',SUPABASE_SERVICE_ROLE_KEY:key,HSE_STAGE_FRAGMENTS:'0',PATH:root+':'+process.env.PATH};
const mock=join(root,'mock.mjs');
writeFileSync(mock,`
let calls=0;
globalThis.fetch=async(url,options)=>{
 if(options.method!=='GET'||options.redirect!=='error'||!url.startsWith('https://ttlptyheuqeotadtcbaw.supabase.co/'))throw Error('unsafe request');
 calls++;
 if(process.env.TEST_STATUS)return new Response('',{status:Number(process.env.TEST_STATUS)});
 if(url.includes('limit=0'))return Response.json([]);
 if(url.includes('/rest/'))return Response.json(['native.pdf','native.doc','fallback.doc','manual.doc','scanned.pdf','broken.pdf'].map(file=>({id:file.replace('.','_'),organization_id:'org-test',file_path:'prevencion/documentos-hse/'+file})));
 return new Response('synthetic source');
};
`);
const readers={
 pdftotext:'case "$*" in *native_pdf.pdf*) printf "Synthetic PDF page\\fSecond page";; *) exit 1;; esac',
 antiword:'case "$*" in *native_doc.doc*) printf "Synthetic DOC text";; *) exit 1;; esac',
 libreoffice:'out=""; previous=""; for arg in "$@"; do if [ "$previous" = "--outdir" ]; then out="$arg"; fi; previous="$arg"; done; case "$*" in *fallback_doc.doc*) printf "Synthetic fallback" > "$out/fallback_doc.txt";; *) exit 1;; esac',
 pdfinfo:'case "$*" in *broken_pdf.pdf*) printf "sensitive-tool-error" >&2; exit 1;; *) printf "Pages: 1\\n";; esac',
 pdftoppm:'exit 0',tesseract:'printf "Synthetic OCR text"'
};
for(const [name,body]of Object.entries(readers)){const file=join(root,name);writeFileSync(file,'#!/bin/sh\n'+body+'\n');chmodSync(file,0o700);}
function run(overrides={},args=[]){
 const result=spawnSync(process.execPath,['--import',mock,script,...args],{env:{...env,...overrides},encoding:'utf8'});
 assert.equal(result.stderr,'');
 assert.ok(!result.stdout.includes(key));
 return {code:result.status,data:JSON.parse(result.stdout)};
}
try{
 const cases=[
  ['missing URL',{SUPABASE_URL:''},'SUPABASE_URL_MISSING'],
  ['missing key',{SUPABASE_SERVICE_ROLE_KEY:''},'SUPABASE_SERVICE_ROLE_KEY_MISSING'],
  ['lookalike host',{SUPABASE_URL:env.SUPABASE_URL+'.attacker.test'},'SUPABASE_PROJECT_NOT_ALLOWED'],
  ['URL credentials',{SUPABASE_URL:'https://user@ttlptyheuqeotadtcbaw.supabase.co'},'SUPABASE_PROJECT_NOT_ALLOWED'],
  ['query',{SUPABASE_URL:env.SUPABASE_URL+'?x=1'},'SUPABASE_PROJECT_NOT_ALLOWED'],
  ['publishable key',{SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_test'},'PRIVILEGED_KEY_REQUIRED'],
  ['invalid key',{SUPABASE_SERVICE_ROLE_KEY:'not-a-key'},'SERVICE_KEY_INVALID'],
  ['staging forbidden',{HSE_STAGE_FRAGMENTS:'1'},'PERSISTENCE_DISABLED'],
  ['API rejects key',{TEST_STATUS:'401'},'SUPABASE_AUTHORIZATION_FAILED']
 ];
 for(const[name,vars,error]of cases)await test(name,()=>{const r=run(vars);assert.equal(r.code,78);assert.equal(r.data.audit_status,'configuration_error');assert.equal(r.data.error_code,error);assert.deepEqual(r.data.documents,[]);});
 await test('network/service failure is infrastructure, not extraction',()=>{const r=run({TEST_STATUS:'503'});assert.equal(r.code,3);assert.equal(r.data.audit_status,'infrastructure_error');});
 await test('preflight authenticates without reading document bytes',()=>{const r=run({},['--preflight']);assert.equal(r.code,0);assert.equal(r.data.audit_status,'configuration_validated');});
 await test('PDF, DOC, DOC fallback, OCR, manual review and parser failure stay distinct',()=>{
  const r=run();assert.equal(r.code,2);assert.equal(r.data.mode,'dry_run');assert.equal(r.data.source_count,6);
  const docs=Object.fromEntries(r.data.documents.map(d=>[d.source_document_id,d]));
  assert.equal(docs.native_pdf.status,'extracted_preview');
  assert.equal(docs.native_pdf.pages.length,2);
  assert.equal(docs.native_doc.status,'extracted_preview');
  assert.equal(docs.fallback_doc.extraction_method,'libreoffice');
  assert.equal(docs.manual_doc.status,'needs_manual_review');
  assert.equal(docs.scanned_pdf.extraction_method,'ocr_tesseract_spa_eng');
  assert.equal(docs.broken_pdf.status,'failed');
  assert.equal(docs.broken_pdf.error_code,'DOCUMENT_EXTRACTION_FAILED');
  assert.ok(!JSON.stringify(r.data).includes('sensitive-tool-error'));
  assert.ok(!JSON.stringify(r.data).includes('Synthetic'));
  assert.ok(docs.fallback_doc.source_sha256);
  assert.ok(docs.fallback_doc.pages[0].sha256);
 });
}finally{rmSync(root,{recursive:true,force:true});}
