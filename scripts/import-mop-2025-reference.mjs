// MOTIL Ingeniería: import a verified text/page pack, never operational facts.
// Default mode is dry-run. Production writes require --execute AND explicit opt-in.
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const getFlag = name => {
  const pos = args.indexOf(name);
  return pos >= 0 ? args[pos + 1] : null;
};
const path = getFlag('--pack');
if (!path || !existsSync(path)) {
  console.error('Uso: node scripts/import-mop-2025-reference.mjs --pack /ruta/mop_2025_complete.ndjson.gz [--execute]');
  process.exit(2);
}
const execute = args.includes('--execute');
const expectedDocs = 12;
const documents = new Map(), chunks = new Map(), partidas = new Map();
const seenKeys = new Set();
const lines = createInterface({
  input: createReadStream(path).pipe(createGunzip()),
  crlfDelay: Infinity,
});
for await (const line of lines) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  if (record.kind === 'document') {
    const doc = record.document;
    if (!doc || !/^mop-2025-(?:v[1-9]|r1873|r348|partidas-v5)$/.test(doc.key) ||
        !/^[a-f0-9]{64}$/.test(doc.sha256) || doc.edition !== '2025' ||
        !['volume','resolution','partidas'].includes(doc.kind)) {
      throw new Error('Identidad o hash de documento inválido');
    }
    if (documents.has(doc.key)) throw new Error('Documento duplicado: ' + doc.key);
    documents.set(doc.key, doc);
    chunks.set(doc.key, []);
  } else if (record.kind === 'chunk') {
    if (!Number.isInteger(record.page) || record.page <= 0 ||
        !Number.isInteger(record.index) || record.index < 0 ||
        typeof record.text !== 'string' || record.text.length > 3000 || !record.text.trim()) {
      throw new Error('Página o fragmento inválido');
    }
    const key = record.document_key + ':' + record.page + ':' + record.index;
    if (seenKeys.has(key)) throw new Error('Fragmento duplicado ' + key);
    seenKeys.add(key);
    // Pack ordering must place document definitions before their fragments.
    if (!chunks.has(record.document_key)) throw new Error('Fragmento sin documento ' + record.document_key);
    chunks.get(record.document_key).push(record);
  } else if (record.kind === 'partida') {
    if (!/^\d{3,4}-\d+[a-z]?$/i.test(String(record.item_code)) || !record.unit ||
        typeof record.description !== 'string' || record.document_key !== 'mop-2025-partidas-v5') {
      throw new Error('Partida sin código, unidad o fuente');
    }
    if (partidas.has(record.item_code)) throw new Error('Partida duplicada ' + record.item_code);
    partidas.set(record.item_code, record);
  } else {
    throw new Error('Tipo de línea no reconocido en fuente: ' + record.kind);
  }
}
if (documents.size !== expectedDocs || partidas.size !== 400) {
  throw new Error('Cobertura incompleta: ' + documents.size + '/12 documentos y ' + partidas.size + '/400 partidas');
}
for (const [key, doc] of documents) {
  const items = chunks.get(key) || [];
  if (doc.kind === 'partidas') {
    if (key !== 'mop-2025-partidas-v5') throw new Error('Fuente de partidas inesperada');
    continue;
  }
  if (!items.length || items.some(item => item.page > doc.pages)) {
    throw new Error('Índice de páginas incompleto o fuera de rango: ' + key);
  }
}
const totalChunks = [...chunks.values()].reduce((n, rows) => n + rows.length, 0);
console.log(JSON.stringify({
  mode: execute ? 'write_requested' : 'dry_run', documents: documents.size,
  totalChunks, partidas: partidas.size,
  warning: 'Extracto de texto; páginas de planos/tablas/imágenes requieren QA visual. No sustituye al PDF fuente.',
}));
if (!execute) process.exit(0);
if (process.env.MOTIL_MOP_INGEST_APPROVED !== 'YES') {
  throw new Error('Para escribir exija MOTIL_MOP_INGEST_APPROVED=YES tras revisar esquema y tenant');
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan variables Supabase de servidor');
const target = new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
if (target !== 'ttlptyheuqeotadtcbaw') {
  throw new Error('Proyecto distinto de MOTIL: identidad de Supabase no verificada');
}
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const batchSize = 220;
async function requireSuccess(operation) {
  const value = await operation;
  if (value.error) throw new Error('Importación interrumpida: '+value.error.message);
  return value;
}
for (const [id, doc] of documents) {
  const existing = await requireSuccess(
    db.from('engineering_mop_documents_v1').select('source_sha256').eq('id',id).maybeSingle()
  );
  if (existing.data && existing.data.source_sha256 !== doc.sha256) {
    throw new Error('Conflicto de versión/hash para '+id+'; no sobrescribir sin revisión');
  }
  await requireSuccess(db.from('engineering_mop_documents_v1').upsert({
    id, edition:'2025', kind:doc.kind, volume:doc.volume ?? null, title:doc.title,
    source_filename:doc.filename, source_sha256:doc.sha256, source_url:doc.source_url,
    page_count:doc.pages ?? null, ingestion_state:'pending',
  },{onConflict:'id'}));
  if (doc.kind === 'partidas') {
    const records = [...partidas.values()].map(item => ({
      document_id:id, item_code:item.item_code, chapter_code:item.chapter_code,
      chapter_name:item.chapter_name, description:item.description,
      unit:item.unit, source_row:item.source_row,
    }));
    for (let i=0;i<records.length;i+=batchSize) {
      await requireSuccess(db.from('engineering_mop_partidas_v1')
        .upsert(records.slice(i,i+batchSize),{onConflict:'document_id,item_code'}));
    }
    const check=await requireSuccess(db.from('engineering_mop_partidas_v1')
      .select('item_code',{head:true,count:'exact'}).eq('document_id',id));
    if (check.count !== records.length) throw new Error('Partidas no conciliadas');
  } else {
    const items = chunks.get(id).map(item => ({
      document_id:id, page_number:item.page, chunk_index:item.index,
      section_ref:item.section, body:item.text,
    }));
    for (let i=0;i<items.length;i+=batchSize) {
      await requireSuccess(db.from('engineering_mop_chunks_v1')
        .upsert(items.slice(i,i+batchSize),{onConflict:'document_id,page_number,chunk_index'}));
    }
    const check=await requireSuccess(db.from('engineering_mop_chunks_v1')
      .select('document_id',{head:true,count:'exact'}).eq('document_id',id));
    if (check.count !== items.length) throw new Error('Conteo de fragmentos no coincide: '+id);
  }
  const textPages = new Set(chunks.get(id).map(item => item.page)).size;
  await requireSuccess(db.from('engineering_mop_documents_v1')
    .update({ingestion_state:'text_indexed',indexed_at:new Date().toISOString(),text_page_count:textPages}).eq('id',id));
  console.log(JSON.stringify({source:id,indexed:doc.kind==='partidas'?400:chunks.get(id).length,
    textPages,originalPdfInStorage:false}));
}
console.log('Textos indexados. PDF originales NO subidos: conservar hash y fuente; validar planos y tablas por imagen.');
