#!/usr/bin/env node
// Bounded HSE spreadsheet intake. No browser/API schema exposure required.
// Dry-run is default; --apply writes ONLY pending source rows to canonical.hse_source_rows.
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in trusted server environment.
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import * as XLSX from 'xlsx';

const apply = process.argv.includes('--apply');
const expected = 'ttlptyheuqeotadtcbaw';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || new URL(url).hostname !== expected + '.supabase.co') throw new Error('Wrong Supabase project URL');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DATABASE_URL) throw new Error('Missing server credentials');
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const hash = data => createHash('sha256').update(data).digest('hex');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
await client.connect();
let inTransaction = false;
try {
  const verify = await client.query("select current_database() as db, to_regclass('canonical.hse_source_rows') is not null as target");
  if (!verify.rows[0]?.target) throw new Error('Canonical target missing');
  const { rows: documents } = await client.query(`select id, organization_id, file_path from public.module_documents
    where file_path like 'prevencion/documentos-hse/%' and lower(file_path) ~ '[.]xlsx?$'
    and organization_id is not null order by file_path limit 20`);
  if (documents.length !== 5) throw new Error('Expected exactly 5 HSE spreadsheets; observed '+documents.length+'. Refusing partial import');
  const unique = new Map(documents.map(d => [d.file_path, d]));
  if (unique.size !== documents.length) throw new Error('Duplicate spreadsheet metadata; review required');
  let files = 0, candidates = 0, inserted = 0, warnings = [];
  if (apply) { await client.query('begin'); inTransaction = true; }
  for (const doc of documents) {
    const { data, error } = await supabase.storage.from('module-documents').download(doc.file_path);
    if (error || !data) { warnings.push({path:doc.file_path,reason:error?.message||'empty'}); continue; }
    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.length > 12*1024*1024) { warnings.push({path:doc.file_path,reason:'size_limit'}); continue; }
    let book;
    try { book = XLSX.read(bytes,{type:'buffer',cellDates:false,cellFormula:true}); }
    catch (e) { warnings.push({path:doc.file_path,reason:'parse_failed'}); continue; }
    files++;
    for (const sheet of book.SheetNames) {
      const ref = book.Sheets[sheet]?.['!ref'];
      if (!ref) continue;
      const bounds=XLSX.utils.decode_range(ref);
      if (bounds.e.r - bounds.s.r > 10000) { warnings.push({path:doc.file_path,sheet,reason:'row_limit'}); continue; }
      for (let row=bounds.s.r;row<=bounds.e.r;row++) {
        const cells=[];
        if (bounds.e.c - bounds.s.c > 100) { warnings.push({path:doc.file_path,sheet,reason:'column_limit'}); break; }
        for(let col=bounds.s.c;col<=bounds.e.c;col++) {
          const cell=book.Sheets[sheet][XLSX.utils.encode_cell({r:row,c:col})];
          cells.push(cell ? {value:cell.v??null,formula:cell.f??null,type:cell.t??null} : null);
        }
        if(cells.every(x=>!x || (x.value==null && !x.formula))) continue;
        candidates++;
        const raw={cells,source_sha256:hash(bytes)};
        const rowHash=hash(JSON.stringify(raw));
        if(apply) {
          const res=await client.query(`insert into canonical.hse_source_rows
            (organization_id,source_document_id,source_file_path,source_sheet,source_row,source_hash,raw_data,normalized_data,canonical_section,validation_status,validation_notes)
            values ($1,$2,$3,$4,$5,$6,$7::jsonb,'{}'::jsonb,'hse','pending',array['Awaiting HSE applicability review'])
            on conflict (source_document_id,source_sheet,source_row,source_hash) do nothing returning id`,
            [doc.organization_id,doc.id,doc.file_path,sheet,row+1,rowHash,JSON.stringify(raw)]);
          inserted+=res.rowCount;
        }
      }
    }
  }
  if(apply) {
    if(files !== documents.length || candidates === 0) warnings.push({reason:'incomplete_batch',files,expected:documents.length,candidates});
    if(warnings.length) { await client.query('rollback'); inTransaction=false; throw new Error('Aborted and rolled back due to '+warnings.length+' extraction failures (details withheld from CI logs)'); }
    await client.query('commit'); inTransaction=false;
  }
  console.log(JSON.stringify({mode:apply?'applied_pending':'dry_run',files,candidate_rows:candidates,inserted,warning_count:warnings.length,warning_reasons:[...new Set(warnings.map(w=>w.reason))]},null,2));
} catch(e) { if(inTransaction) await client.query('rollback'); throw e; }
finally { await client.end(); }
