import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isMopQuestion, deriveMopSearch, toMopReference,
  toMopPartida, MOP_2025_URL,
} from '../lib/engineering/mop-reference.mjs';

const hash='a'.repeat(64);

test('Manual queries target MOP content, not generic project/operational requests',()=>{
  assert.equal(isMopQuestion('¿Qué indica el Manual de Carreteras sobre drenaje?'),true);
  assert.equal(isMopQuestion('Necesito revisar la partida 107-1a'),true);
  assert.equal(isMopQuestion('¿Qué dice la sección 2.308?'),true);
  assert.equal(isMopQuestion('¿Qué ingresos reportó la mina hoy?'),false);
});

test('Manual retrieval prefers exact numerals and never includes person or product names',()=>{
  assert.equal(deriveMopSearch('¿Qué exige el numeral 2.308 sobre cubicación?'),'2.308');
  const query=deriveMopSearch('Cristian de La Patagua pregunta sobre pavimentos y drenajes');
  assert.match(query,/pavimentos/i);
  assert.doesNotMatch(query,/cristian|patagua/i);
});

test('Manual citation must be grounded in page number, source hash and verified edition',()=>{
  const input={
    document_id:'mop-2025-v2',document_title:'Procedimientos de Estudios Viales',
    edition:'2025',volume:2,page_number:181,chunk_index:0,
    section_ref:'2.308',source_sha256:hash,excerpt:'Cubicaciones mediante modelos digitales',
    source_url:'https://untrusted.example',
  };
  const item=toMopReference(input);
  assert.equal(item.pdfPage,181);
  assert.equal(item.section,'2.308');
  assert.match(item.label,/Vol. 2.*PDF p. 181.*2.308/);
  assert.equal(item.sourceUrl,MOP_2025_URL);
  assert.equal(item.applicability,'requiere_revision_del_proyecto_y_contrato');
  assert.equal(toMopReference({...input,page_number:0}),null);
  assert.equal(toMopReference({...input,source_sha256:'malformed'}),null);
  assert.equal(toMopReference({...input,excerpt:''}),null);
});

test('Partida references preserve alphanumeric suffix, unit and explicit absence of prices',()=>{
  const item=toMopPartida({
    item_code:'107-1a',chapter_code:'5100',
    description:'Partida de muestra del registro',unit:'m³',
    source_row:29,source_sha256:hash,
  });
  assert.equal(item.code,'107-1a');
  assert.equal(item.unit,'m³');
  assert.equal(item.hasUnitPrice,false);
  assert.equal(toMopPartida({...item,source_sha256:'missing'}),null);
});

test('Schema is private and importer is fail-closed by default',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261116183000_engineering_mop_reference_library_v1.sql',import.meta.url),'utf8');
  const importer=await readFile(new URL('../scripts/import-mop-2025-reference.mjs',import.meta.url),'utf8');
  const api=await readFile(new URL('../app/api/intelligence/engineering-assistant/route.ts',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/g);
  assert.match(sql,/revoke all on public.engineering_mop_chunks_v1 from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public.search_engineering_mop_v1.*to service_role/i);
  assert.match(importer,/const execute = args.includes\('--execute'\)/);
  assert.match(importer,/MOTIL_MOP_INGEST_APPROVED/);
  assert.match(importer,/target !== 'ttlptyheuqeotadtcbaw'/);
  assert.match(importer,/source_sha256 !== doc.sha256/);
  assert.match(importer,/partidas.size !== 400/);
  assert.match(api,/authorizedEngineering\(request\)/);
  assert.match(api,/searchEngineeringMopLibrary\(resolved.context.supabase, question\)/);
  assert.match(api,/No encontré un apartado verificable/);
  assert.match(api,/manualReferences: manual.references/);
  assert.match(api,/manualPartidas: manual.partidas/);
  assert.match(api,/No autorices tareas/);
});
