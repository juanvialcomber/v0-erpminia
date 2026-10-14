#!/usr/bin/env node
/**
 * Read-only canonical document intake for MOTIL.
 * Usage: node scripts/canonical-hse-intake.mjs --limit=10
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on a trusted machine.
 * Does not insert/update database rows or modify Storage objects.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const BUCKET = 'module-documents';
const PREFIX = 'prevencion/documentos-hse/';
const MAX_BYTES = 12 * 1024 * 1024;
const args = Object.fromEntries(process.argv.slice(2).filter(x => /^--[a-z-]+(?:=.+)?$/.test(x)).map(x => x.slice(2).split(/=(.*)/s).slice(0, 2)));
const limit = Math.max(1, Math.min(500, Number(args.limit || 10)));
if (!Number.isInteger(limit)) throw new Error('Invalid --limit');
const outDir = path.resolve(args.output || '.local/canonical-hse-intake');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing server-only Supabase credentials');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sha256 = b => createHash('sha256').update(b).digest('hex');

function runBinary(binary, input) {
  const result = spawnSync(binary, ['-'], { input, maxBuffer: 16 * 1024 * 1024, timeout: 15000 });
  if (result.error || result.status !== 0) throw new Error(binary + ': unavailable or conversion failed');
  return result.stdout.toString('utf8');
}
function decode(buffer, name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') {
    // pdftotext reads stdin as '-' and writes stdout as '-'
    const p = spawnSync('pdftotext', ['-layout', '-', '-'], { input: buffer, maxBuffer: 16 * 1024 * 1024, timeout: 20000 });
    if (p.error || p.status !== 0) return { status: 'needs_pdf_converter', text: '' };
    const text = p.stdout.toString('utf8');
    return { status: text.trim().length < 80 ? 'needs_visual_review' : 'extracted', text };
  }
  if (ext === '.doc') {
    try { const text = runBinary('antiword', buffer); return { status: text.trim() ? 'extracted' : 'needs_visual_review', text }; }
    catch { return { status: 'needs_legacy_converter', text: '' }; }
  }
  if (['.xls', '.xlsx'].includes(ext)) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellDates: false });
      const sheets = workbook.SheetNames.map(name => ({ name, text: XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false }) }));
      return { status: 'extracted', text: sheets.map(s => '## '+s.name+'\n'+s.text).join('\n'), sheets: sheets.map(s => s.name) };
    } catch { return { status: 'needs_spreadsheet_converter', text: '' }; }
  }
  if (ext === '.docx') return { status: 'needs_docx_converter', text: '' };
  return { status: 'unsupported', text: '' };
}
async function main() {
  await mkdir(outDir, { recursive: true, mode: 0o700 });
  let entries = [], offset = 0;
  while (entries.length < limit) {
    const pageSize = Math.min(100, limit - entries.length);
    const { data, error } = await client.storage.from(BUCKET).list(PREFIX.slice(0, -1), { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error('Storage list failed: '+error.message);
    const batch = (data || []).filter(f => f.name && f.id);
    entries.push(...batch);
    if (!data?.length || data.length < pageSize) break;
    offset += data.length;
  }
  const records = [];
  for (const file of entries.slice(0, limit)) {
    const name = PREFIX + file.name;
    const base = { bucket: BUCKET, path: name, storage_id: file.id, size: file.metadata?.size ?? null, observed_at: new Date().toISOString() };
    if (base.size != null && base.size > MAX_BYTES) { records.push({ ...base, status: 'size_limit' }); continue; }
    const { data, error } = await client.storage.from(BUCKET).download(name);
    if (error || !data) { records.push({ ...base, status: 'download_failed', reason: error?.message || 'empty' }); continue; }
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.length > MAX_BYTES) { records.push({ ...base, status: 'size_limit' }); continue; }
    const result = decode(buffer, name);
    const digest = sha256(buffer);
    const record = { ...base, sha256: digest, downloaded_bytes: buffer.length, status: result.status, text_chars: result.text.length, sheets: result.sheets || [] };
    if (result.text) {
      const basename = digest + '.txt';
      await writeFile(path.join(outDir, basename), result.text, { mode: 0o600, flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
      record.extraction_file = basename;
    }
    records.push(record);
  }
  const report = { tenant: 'motil', scope: PREFIX, generated_at: new Date().toISOString(), requested_limit: limit, files: records, complete_extraction: records.length === limit && records.every(r => r.status === 'extracted') };
  // Never treat a partial extraction as a canonical source.
  const reportFile = path.join(outDir, 'intake-' + Date.now() + '.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ reportFile, total: records.length, byStatus: records.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {}) }, null, 2));
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
