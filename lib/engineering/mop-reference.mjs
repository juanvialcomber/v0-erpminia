// Human-readable, source-bound MOP citations. Pure module for tests and server use.
export const MOP_2025_URL = 'https://mc.mop.gob.cl/Cliente/Index/';
const STOP = new Set([
  'que','qué','para','como','cómo','cual','cuál','cuales','cuáles','donde','dónde',
  'con','los','las','del','por','una','unos','unas','este','esta','estos','estas',
  'debo','debemos','puede','podemos','sobre','desde','hasta','cuando','cuándo',
  'manual','carreteras','motil','patagua','cristian','volumen','edicion',
  'necesito','necesitamos','segun','según','dice','cual es','hay','esta','es',
]);
export function isMopQuestion(value) {
  return /manual de carreteras|mop|normativa vial|volumen\s*[1-9]|secci[oó]n\s*[1-9]\.\d{3}|numeral\s*[1-9]\.\d{3}|partidas?|presupuest|caminos?|cubicaci[oó]n|pavimento|asfalto|alcantarill|drenaje|taludes?|geot[eé]cnia|v[ií]al|ensayo|muestreo|carpeta de rodadura|ejes equivalentes/i.test(String(value || ''));
}
export function deriveMopSearch(value) {
  const q=String(value||'').trim().slice(0,500);
  const exact=q.match(/\b[1-9]\.\d{3}(?:\.\d{1,3})?(?:\(\d+\))?\b/);
  if (exact) return exact[0];
  const plain=q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const words=plain.match(/[a-z0-9]+/g)||[];
  const filtered=[...new Set(words.filter(t => t.length>=4 && !STOP.has(t)))].slice(0,6);
  return filtered.join(' OR ').slice(0,250);
}
export function toMopReference(row) {
  if (!row || typeof row.document_id !== 'string' ||
      !/^[a-f0-9]{64}$/.test(String(row.source_sha256||'')) ||
      !Number.isInteger(Number(row.page_number)) || Number(row.page_number)<1 ||
      typeof row.excerpt !== 'string' || !row.excerpt.trim()) return null;
  const volume=Number(row.volume);
  const label=Number.isInteger(volume)&&volume>=1&&volume<=9
    ? 'MC 2025 · Vol. '+volume
    : 'MC 2025 · Resolución';
  const page=Number(row.page_number);
  // Do not attribute the first numeric cross-reference in a contents page as its section.
  const headings=[...row.excerpt.matchAll(/(?:^|\n)\s*([1-9]\.\d{3}(?:\.\d{1,3})?(?:\(\d+\))?)\s+[A-ZÁÉÍÓÚÑ]/g)]
    .map(m=>m[1]);
  const uniqueHeadings=[...new Set(headings)];
  const section=typeof row.section_ref==='string' &&
    uniqueHeadings.length===1 && uniqueHeadings[0]===row.section_ref
      ? row.section_ref : null;
  return {
    documentId:row.document_id,
    title:String(row.document_title||'Manual de Carreteras 2025'),
    edition:'2025',volume:Number.isInteger(volume)&&volume>=1&&volume<=9?volume:null,
    pdfPage:page, section, sha256:row.source_sha256,
    sourceUrl:MOP_2025_URL,
    label:label+' · PDF p. '+page+(section?' · §'+section:''),
    excerpt:row.excerpt.slice(0,1700),
    isTechnicalReference:true,
    applicability:'requiere_revision_del_proyecto_y_contrato',
  };
}
export function toMopPartida(row) {
  if (!row || typeof row.item_code!=='string' ||
      !/^\d{3,4}-\d+[a-z]?$/i.test(row.item_code) ||
      !row.description || !row.unit ||
      !/^[a-f0-9]{64}$/.test(String(row.source_sha256||''))) return null;
  return {
    code:row.item_code,chapter:String(row.chapter_code||''),
    description:String(row.description).slice(0,300),unit:String(row.unit).slice(0,30),
    sourceRow:Number(row.source_row)||null,
    edition:'2025',sha256:row.source_sha256,sourceUrl:MOP_2025_URL,
    hasUnitPrice:false,
  };
}
