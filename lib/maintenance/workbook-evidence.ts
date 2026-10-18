import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';
import * as SheetJS from 'xlsx';

// The application's existing xlsx path alias exposes a deliberately small
// ambient type. Keep this parser's adapter local instead of widening that
// shared declaration or adding a dependency.
type VendorRange = { s: { r: number; c: number }; e: { r: number; c: number } };
type VendorCell = { t: string; v?: string | number | boolean | Date; w?: string; z?: string | number;
  f?: string; F?: string; s?: unknown; l?: unknown; c?: unknown; r?: unknown };
type VendorName = { Name: string; Ref: string; Sheet?: number; Comment?: string };
type VendorSheet = { [key: string]: unknown; '!ref'?: string; '!fullref'?: string; '!rows'?: unknown; '!cols'?: unknown; '!merges'?: VendorRange[] };
type VendorWorkbook = { SheetNames: string[]; Sheets: Record<string, VendorSheet>; Deps?: unknown;
  Workbook?: { Sheets?: Array<{ Hidden?: number }>; Names?: VendorName[]; WBProps?: { date1904?: boolean } } };
const XLSX = SheetJS as unknown as {
  version: string;
  read(bytes: Uint8Array, options: Record<string, unknown>): VendorWorkbook;
  utils: { decode_col(column: string): number; decode_cell(address: string): { r: number; c: number }; encode_range(range: VendorRange): string };
};

// This is an evidence protocol, not a maintenance plan or a calculation engine.
// Client components may import its types with `import type` only.
export const WORKBOOK_EVIDENCE_SCHEMA_VERSION = 'motil.workbook-evidence.v1' as const;
export const WORKBOOK_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export const WORKBOOK_EVIDENCE_LIMITS = Object.freeze({
  maxBytes: 20 * 1024 * 1024,
  maxInflatedBytes: 32 * 1024 * 1024,
  maxSheets: 100,
  maxCells: 200_000,
  maxManifestBytes: 32 * 1024 * 1024,
});

export type WorkbookScalar = string | number | boolean | null;
type JsonValue = WorkbookScalar | JsonValue[] | { [key: string]: JsonValue };
export type WorkbookEvidenceReference = {
  kind: 'cell' | 'range' | 'defined-name';
  raw: string;
  sheet: string | null;
  address: string | null;
  name: string | null;
  external: boolean;
};
export interface WorkbookEvidenceCell {
  address: string;
  row: number;
  column: number;
  type: string;
  /** Literal value only. Formula results belong exclusively in cachedValue. */
  value: WorkbookScalar;
  hasValue: boolean;
  format: string | null;
  /** SheetJS display text; not a verified formula result or raw XML text. */
  text: string | null;
  formula: string | null;
  arrayFormulaRange: string | null;
  cachedValue: WorkbookScalar;
  hasCachedValue: boolean;
  dependencies: WorkbookEvidenceReference[];
  style: JsonValue;
  hyperlink: JsonValue;
  comments: JsonValue;
  richText: JsonValue;
  /** Present for XLSX. Absent v/f and an explicitly empty v/f remain distinct. */
  sourceXml?: WorkbookXmlCell;
}
export interface WorkbookXmlCell {
  type?: string;
  style?: string;
  value?: string;
  formula?: string;
  formulaAttributes?: Record<string, string>;
}
export interface WorkbookEvidenceCounts {
  sheets: number;
  hiddenSheets: number;
  cells: number;
  formulaCells: number;
  cachedFormulaCells: number;
  mergedRanges: number;
  definedNames: number;
  dependencies: number;
}
export interface WorkbookEvidenceManifest {
  schemaVersion: typeof WORKBOOK_EVIDENCE_SCHEMA_VERSION;
  file: { name: string; extension: 'xlsx' | 'xls'; byteLength: number; sha256: string };
  parser: { name: 'SheetJS'; version: string };
  dateSystem: '1900' | '1904';
  sheets: Array<{
    index: number;
    name: string;
    visibility: 'visible' | 'hidden' | 'veryHidden';
    range: string | null;
    cells: WorkbookEvidenceCell[];
    mergedRanges: string[];
    rowMetadata: JsonValue;
    columnMetadata: JsonValue;
  }>;
  definedNames: Array<{
    name: string;
    reference: string;
    scopeSheetIndex: number | null;
    scopeSheetName: string | null;
    comment: string | null;
    dependencies: WorkbookEvidenceReference[];
  }>;
  calculationChain: JsonValue;
  counts: WorkbookEvidenceCounts;
  warnings: string[];
  fidelity: {
    formulasCalculated: false;
    dependencies: 'lexical-evidence';
    originalIsAuthority: true;
  };
}
export type WorkbookEvidenceResponse = {
  ok: true;
  manifest: WorkbookEvidenceManifest;
  counts: WorkbookEvidenceCounts;
  warnings: string[];
  persisted: boolean;
  reused?: boolean;
  document?: { id: string; fileName: string; status: 'draft'; sha256: string; version?: number; previousVersionId?: string | null };
} | { ok: false; error: string; code: string; details?: Record<string, unknown> };

export class WorkbookEvidenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WorkbookEvidenceError';
  }
}

export function workbookBytesSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function failLimit(label: string, observed: number, limit: number): never {
  throw new WorkbookEvidenceError('WORKBOOK_LIMIT_EXCEEDED',
    `El archivo supera el límite de ${label} (${limit}). No se ha omitido ni guardado información.`,
    413, { limit: label, maximum: limit, observed });
}

function jsonEvidence(value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new WorkbookEvidenceError('NON_FINITE_VALUE', 'Hay un valor numérico que no puede conservarse fielmente en JSON.');
    return value;
  }
  if (Array.isArray(value)) return Array.from(value, jsonEvidence);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonEvidence(entry)]));
  }
  throw new WorkbookEvidenceError('UNSUPPORTED_VALUE', 'Hay un valor que el protocolo de evidencia no puede representar.');
}

function xmlText(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const predefined: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (predefined[entity]) return predefined[entity];
    const point = entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return String.fromCodePoint(point);
  });
}

function xmlAttributes(fragment: string): Record<string, string> {
  return Object.fromEntries(Array.from(fragment.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g),
    (match) => [match[1], xmlText(match[2] ?? match[3])]));
}

function xmlElement(body: string, name: string) {
  const match = new RegExp(`<(?:[\\w.-]+:)?${name}\\b([^>]*?)(?:\\s*/>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>)`).exec(body);
  return match ? { attributes: xmlAttributes(match[1]), text: xmlText(match[2] ?? '') } : null;
}

function sourceXmlSheets(xmlFiles: Map<string, string>) {
  const workbook = xmlFiles.get('xl/workbook.xml');
  const relationships = xmlFiles.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new WorkbookEvidenceError('MISSING_WORKBOOK_XML', 'Falta la estructura XML necesaria para verificar todas las hojas.');
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/g)) {
    const attributes = xmlAttributes(match[1]);
    if (attributes.TargetMode !== 'External') targets.set(attributes.Id, attributes.Target.startsWith('/') ? attributes.Target.slice(1) : posix.normalize(posix.join('xl', attributes.Target)));
  }
  const result = new Map<string, Map<string, WorkbookXmlCell>>();
  const customFormats = new Map<string, string>();
  const styleFormats = new Map<string, string>();
  const styleXml = xmlFiles.get('xl/styles.xml') ?? '';
  for (const match of styleXml.matchAll(/<(?:[\w.-]+:)?numFmt\b([^>]*)\/?\s*>/g)) {
    const fields = xmlAttributes(match[1]);
    if (fields.numFmtId !== undefined && fields.formatCode !== undefined) customFormats.set(fields.numFmtId, fields.formatCode);
  }
  const cellFormats = xmlElement(styleXml, 'cellXfs');
  if (cellFormats) {
    let index = 0;
    for (const match of cellFormats.text.matchAll(/<(?:[\w.-]+:)?xf\b([^>]*)\/?\s*>/g)) {
      const format = customFormats.get(xmlAttributes(match[1]).numFmtId);
      if (format !== undefined) styleFormats.set(String(index), format);
      index++;
    }
  }
  for (const match of workbook.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/g)) {
    const attributes = xmlAttributes(match[1]);
    const xml = xmlFiles.get(targets.get(attributes['r:id']) ?? '');
    if (xml === undefined) throw new WorkbookEvidenceError('MISSING_SHEET_XML', `No se pudo verificar el XML de la hoja «${attributes.name}».`);
    const cells = new Map<string, WorkbookXmlCell>();
    for (const cell of xml.matchAll(/<(?:[\w.-]+:)?c\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c\s*>)/g)) {
      const fields = xmlAttributes(cell[1]);
      if (!fields.r || cells.has(fields.r)) throw new WorkbookEvidenceError('INVALID_XML_CELL_ADDRESS', 'Hay celdas sin dirección explícita o con direcciones duplicadas en el XML.');
      const value = xmlElement(cell[2] ?? '', 'v');
      const formula = xmlElement(cell[2] ?? '', 'f');
      const evidence: WorkbookXmlCell = {};
      if (fields.t !== undefined) evidence.type = fields.t;
      if (fields.s !== undefined) evidence.style = fields.s;
      if (value) evidence.value = value.text;
      if (formula) {
        evidence.formula = formula.text;
        if (Object.keys(formula.attributes).length) evidence.formulaAttributes = formula.attributes;
      }
      cells.set(fields.r, evidence);
    }
    result.set(attributes.name, cells);
  }
  return { sheets: result, styleFormats };
}

// Bound actual inflated bytes before SheetJS parses ZIP XML. Declared ZIP sizes
// alone do not protect against oversized or deliberately misleading archives.
function checkXlsxContainer(bytes: Buffer, limits: typeof WORKBOOK_EVIDENCE_LIMITS) {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
  }
  const invalid = () => { throw new WorkbookEvidenceError('INVALID_XLSX', 'El archivo no es un contenedor XLSX íntegro y compatible.'); };
  if (end < 0) return invalid();
  const entries = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || entries === 65535 ||
      bytes.readUInt16LE(end + 8) !== entries || offset + directorySize !== end) return invalid();
  if (entries > 4000) failLimit('entradas del contenedor', entries, 4000);
  let inflated = 0;
  let cells = 0;
  const paths = new Set<string>();
  const xmlFiles = new Map<string, string>();
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) return invalid();
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const inflatedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const recordSize = 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    if (offset + recordSize > end || flags & 1 || ![0, 8].includes(method) || local + 30 > bytes.length ||
        bytes.readUInt32LE(local) !== 0x04034b50) return invalid();
    const path = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (paths.has(path)) return invalid();
    paths.add(path);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressedSize > bytes.length) return invalid();
    if (inflated + inflatedSize > limits.maxInflatedBytes) failLimit('bytes descomprimidos', inflated + inflatedSize, limits.maxInflatedBytes);
    const compressed = bytes.subarray(start, start + compressedSize);
    let content: Buffer;
    try {
      content = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: limits.maxInflatedBytes - inflated + 1 });
    } catch {
      throw new WorkbookEvidenceError('INVALID_OR_OVERSIZED_XLSX', 'El contenedor está dañado o supera el límite de descompresión. No se ha procesado parcialmente.', 422);
    }
    inflated += content.length;
    if (inflated > limits.maxInflatedBytes) failLimit('bytes descomprimidos', inflated, limits.maxInflatedBytes);
    if (content.length !== inflatedSize) return invalid();
    if (/\.(xml|rels)$/i.test(path)) xmlFiles.set(path, content.toString('utf8'));
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(path)) {
      for (const _match of content.toString('utf8').matchAll(/<(?:\w+:)?c(?:\s|>)/g)) {
        cells++;
        if (cells > limits.maxCells) failLimit('celdas', cells, limits.maxCells);
      }
    }
    offset += recordSize;
  }
  if (offset !== end || !paths.has('[Content_Types].xml') || !paths.has('xl/workbook.xml')) return invalid();
  return sourceXmlSheets(xmlFiles);
}

function hasIdentifierChar(char: string | undefined) { return Boolean(char && /[\p{L}\p{N}_.\\]/u.test(char)); }
function validAddress(address: string): boolean {
  return address.split(':').every((part) => {
    const clean = part.replace(/\$/g, '');
    if (/^[A-Z]+$/.test(clean)) return XLSX.utils.decode_col(clean) < 16384;
    if (/^[1-9]\d*$/.test(clean)) return Number(clean) <= 1048576;
    const match = clean.match(/^([A-Z]+)([1-9]\d*)$/);
    return Boolean(match && XLSX.utils.decode_col(match[1]) < 16384 && Number(match[2]) <= 1048576);
  });
}

/** Conservative lexical references; never a resolved or recalculated graph. */
export function workbookFormulaReferences(formula: string, sheetName: string | null, definedNames: string[] = []): WorkbookEvidenceReference[] {
  const masked = formula.replace(/"(?:[^"]|"")*"/g, (match) => ' '.repeat(match.length));
  const references: WorkbookEvidenceReference[] = [];
  const occupied: Array<[number, number]> = [];
  const pattern = /(?:(?:'(?:[^']|'')+'|(?:\[[^\]]+\])?[\p{L}_\\][\p{L}\p{N}_.\\]*(?::[\p{L}_\\][\p{L}\p{N}_.\\]*)?)!)?(?:\$?[A-Z]{1,3}\$?[1-9]\d*(?::\$?[A-Z]{1,3}\$?[1-9]\d*)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?[1-9]\d*:\$?[1-9]\d*)/gu;
  for (const match of masked.matchAll(pattern)) {
    const start = match.index!;
    const end = start + match[0].length;
    if (hasIdentifierChar(masked[start - 1]) || hasIdentifierChar(masked[end]) || masked[end] === '(') continue;
    // Ignore cell-like headings inside structured table references. An external
    // workbook prefix is retained when it is part of the complete match.
    const prefix = masked.slice(0, start);
    if (prefix.lastIndexOf('[') > prefix.lastIndexOf(']')) continue;
    const bang = match[0].lastIndexOf('!');
    const address = match[0].slice(bang + 1);
    if (!validAddress(address)) continue;
    const qualifier = bang < 0 ? null : match[0].slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
    references.push({ kind: address.includes(':') ? 'range' : 'cell', raw: formula.slice(start, end),
      sheet: qualifier ?? sheetName, address, name: null, external: Boolean(qualifier?.includes('[')) });
    occupied.push([start, end]);
  }
  for (const name of new Set(definedNames)) {
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of masked.matchAll(new RegExp(escaped, 'giu'))) {
      const start = match.index!;
      const end = start + match[0].length;
      if (hasIdentifierChar(masked[start - 1]) || hasIdentifierChar(masked[end]) || masked[end] === '(' || masked[end] === '!' ||
          occupied.some(([from, to]) => start < to && end > from)) continue;
      references.push({ kind: 'defined-name', raw: formula.slice(start, end), sheet: sheetName, address: null, name, external: false });
    }
  }
  return references;
}

export function parseWorkbookEvidence(
  input: Uint8Array,
  fileName: string,
  overrides: Partial<typeof WORKBOOK_EVIDENCE_LIMITS> = {},
): WorkbookEvidenceManifest {
  const limits = { ...WORKBOOK_EVIDENCE_LIMITS, ...overrides };
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls') {
    throw new WorkbookEvidenceError('UNSUPPORTED_FORMAT', 'Este piloto acepta XLSX y XLS binario. CSV y otros formatos aún no están habilitados.', 415);
  }
  if (bytes.length === 0) throw new WorkbookEvidenceError('EMPTY_FILE', 'El archivo está vacío.', 400);
  if (bytes.length > limits.maxBytes) failLimit('bytes del archivo', bytes.length, limits.maxBytes);
  const sourceEvidence = extension === 'xlsx' ? checkXlsxContainer(bytes, limits) : null;
  const sourceSheets = sourceEvidence?.sheets;
  if (extension === 'xls' && (bytes.length < 8 || bytes.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1')) {
    throw new WorkbookEvidenceError('INVALID_XLS', 'Se requiere XLS binario BIFF dentro de un contenedor OLE. No se acepta HTML o texto renombrado como XLS.');
  }
  let book: VendorWorkbook;
  const options = {
    type: 'buffer', cellFormula: true, cellNF: true, cellText: true, cellStyles: true,
    cellDates: false, sheetStubs: true, xlfn: true, bookDeps: true, raw: true,
    dense: false, WTF: true,
  };
  try {
    const names = XLSX.read(bytes, { ...options, bookSheets: true });
    if (names.SheetNames.length > limits.maxSheets) failLimit('hojas', names.SheetNames.length, limits.maxSheets);
    book = XLSX.read(bytes, options);
    if (book.SheetNames.length !== names.SheetNames.length) throw new Error('Inconsistent worksheet count');
  } catch (error) {
    if (error instanceof WorkbookEvidenceError) throw error;
    throw new WorkbookEvidenceError('WORKBOOK_PARSE_FAILED', 'No se pudo leer íntegramente el libro. Puede estar dañado, cifrado o contener una característica no compatible. El original no se ha modificado.');
  }
  if (book.SheetNames.length === 0) throw new WorkbookEvidenceError('NO_SHEETS', 'El libro no contiene hojas que puedan leerse.');
  const names = book.Workbook?.Names ?? [];
  const counts: WorkbookEvidenceCounts = { sheets: book.SheetNames.length, hiddenSheets: 0, cells: 0, formulaCells: 0, cachedFormulaCells: 0, mergedRanges: 0, definedNames: names.length, dependencies: 0 };
  const warnings = [
    'El original es la fuente de autoridad. Esta lectura conserva las celdas y metadatos que expone SheetJS; no reproduce íntegramente objetos, gráficos, macros o formato visual.',
    'Las referencias son evidencia textual, no un grafo resuelto. Funciones dinámicas, tablas, referencias 3D y nombres pueden requerir revisión en el original.',
  ];
  let estimatedCellBytes = 0;
  const sheets = book.SheetNames.map<WorkbookEvidenceManifest['sheets'][number]>((name, index) => {
    const sheet = book.Sheets[name];
    if (!sheet || sheet['!fullref']) throw new WorkbookEvidenceError('INCOMPLETE_SHEET', `No se pudo conservar íntegramente la hoja «${name}».`);
    const rawCells = sourceSheets?.get(name);
    if (sourceSheets && !rawCells) throw new WorkbookEvidenceError('INCOMPLETE_SOURCE_XML', `Falta la evidencia XML de la hoja «${name}».`);
    const visibility: WorkbookEvidenceManifest['sheets'][number]['visibility'] = book.Workbook?.Sheets?.[index]?.Hidden === 2 ? 'veryHidden' : book.Workbook?.Sheets?.[index]?.Hidden === 1 ? 'hidden' : 'visible';
    if (visibility !== 'visible') counts.hiddenSheets++;
    const cells: WorkbookEvidenceCell[] = [];
    const availableNames = names.filter((entry) => entry.Sheet === undefined || entry.Sheet === index).map((entry) => entry.Name);
    // Enumerate materialized addresses, including stubs. Never expand !ref or
    // discard out-of-range cells; a large used-range need not imply many cells.
    for (const address of Object.keys(sheet)) {
      if (address.startsWith('!')) continue;
      if (!/^[A-Z]+[1-9]\d*$/.test(address)) throw new WorkbookEvidenceError('UNSUPPORTED_CELL_ADDRESS', `Dirección de celda no compatible en «${name}».`);
      const source = sheet[address] as VendorCell;
      if (++counts.cells > limits.maxCells) failLimit('celdas', counts.cells, limits.maxCells);
      const rawXml = rawCells?.get(address);
      if (rawCells && !rawXml) throw new WorkbookEvidenceError('SYNTHETIC_CELL', `El lector produjo una celda sin evidencia XML en «${name}!${address}».`);
      const formula = typeof source.f === 'string' ? source.f : rawXml?.formula ?? null;
      const formulaRelated = formula !== null || typeof source.F === 'string';
      // SheetJS maps numeric <v/> to 0. That is not an observed cached value.
      // Conversely, t="str" <v/> is an explicitly stored empty string.
      const hasSourceValue = rawXml
        ? (rawXml.value !== undefined && (rawXml.value.trim() !== '' || rawXml.type === 'str')) ||
          (!formulaRelated && rawXml.type === 'inlineStr' && source.v !== undefined)
        : source.v !== undefined && source.v !== null;
      const originalScalar = rawXml && ['str', 'e', 'd'].includes(rawXml.type ?? '') && rawXml.value !== undefined ? rawXml.value : source.v;
      const scalar = hasSourceValue ? jsonEvidence(originalScalar) : null;
      if (scalar !== null && typeof scalar === 'object') throw new WorkbookEvidenceError('UNSUPPORTED_CELL_VALUE', `Valor de celda no compatible en «${name}!${address}».`);
      const dependencies = formula === null ? [] : workbookFormulaReferences(formula, name, availableNames);
      counts.dependencies += dependencies.length;
      if (formulaRelated) counts.formulaCells++;
      if (formulaRelated && hasSourceValue) counts.cachedFormulaCells++;
      const decoded = XLSX.utils.decode_cell(address);
      const cell: WorkbookEvidenceCell = {
        address, row: decoded.r + 1, column: decoded.c + 1, type: rawXml ? rawXml.type ?? 'n' : source.t,
        value: formulaRelated ? null : scalar, hasValue: !formulaRelated && hasSourceValue,
        format: sourceEvidence?.styleFormats.get(rawXml?.style ?? '0') ?? (source.z === undefined ? null : String(source.z)),
        text: hasSourceValue ? (rawXml?.type === 'str' && rawXml.value === '' ? '' : source.w ?? null) : null,
        formula, arrayFormulaRange: source.F ?? null,
        cachedValue: formulaRelated ? scalar : null, hasCachedValue: formulaRelated && hasSourceValue,
        dependencies, style: jsonEvidence(source.s), hyperlink: jsonEvidence(source.l),
        comments: jsonEvidence(source.c), richText: jsonEvidence(source.r),
        ...(rawXml ? { sourceXml: rawXml } : {}),
      };
      estimatedCellBytes += Buffer.byteLength(JSON.stringify(cell), 'utf8');
      if (estimatedCellBytes > limits.maxManifestBytes) failLimit('bytes del manifiesto', estimatedCellBytes, limits.maxManifestBytes);
      cells.push(cell);
    }
    cells.sort((left, right) => left.row - right.row || left.column - right.column);
    if (rawCells && cells.length !== rawCells.size) throw new WorkbookEvidenceError('OMITTED_XML_CELLS', `El lector no conservó todas las celdas XML de «${name}». No se devolvió una extracción parcial.`);
    const mergedRanges = (sheet['!merges'] ?? []).map((range) => XLSX.utils.encode_range(range));
    counts.mergedRanges += mergedRanges.length;
    return { index, name, visibility, range: sheet['!ref'] ?? null, cells, mergedRanges,
      rowMetadata: jsonEvidence(sheet['!rows']), columnMetadata: jsonEvidence(sheet['!cols']) };
  });
  const definedNames = names.map((name) => {
    const scopeSheetIndex = name.Sheet ?? null;
    const scopeSheetName = scopeSheetIndex === null ? null : book.SheetNames[scopeSheetIndex] ?? null;
    const dependencies = workbookFormulaReferences(name.Ref, scopeSheetName, names.map((entry) => entry.Name));
    counts.dependencies += dependencies.length;
    return { name: name.Name, reference: name.Ref, scopeSheetIndex, scopeSheetName, comment: name.Comment ?? null, dependencies };
  });
  if (counts.hiddenSheets) warnings.push(`Se incluyeron ${counts.hiddenSheets} hojas ocultas o muy ocultas.`);
  if (counts.formulaCells) warnings.push('No se calcularon fórmulas. Los valores en caché pueden estar desactualizados; se conservan separados de la fórmula.');
  if (counts.formulaCells > counts.cachedFormulaCells) warnings.push(`${counts.formulaCells - counts.cachedFormulaCells} celdas de fórmula no tienen valor en caché disponible.`);
  if (extension === 'xls') warnings.push('En XLS las fórmulas se representan a partir de tokens BIFF. El texto original y características no expuestas por el lector solo se conservan en los bytes originales.');
  const manifest: WorkbookEvidenceManifest = {
    schemaVersion: WORKBOOK_EVIDENCE_SCHEMA_VERSION,
    file: { name: fileName, extension, byteLength: bytes.length, sha256: workbookBytesSha256(bytes) },
    parser: { name: 'SheetJS', version: XLSX.version },
    dateSystem: book.Workbook?.WBProps?.date1904 ? '1904' : '1900',
    sheets, definedNames, calculationChain: jsonEvidence(book.Deps),
    counts, warnings, fidelity: { formulasCalculated: false, dependencies: 'lexical-evidence', originalIsAuthority: true },
  };
  const manifestBytes = Buffer.byteLength(JSON.stringify(manifest), 'utf8');
  if (manifestBytes > limits.maxManifestBytes) failLimit('bytes del manifiesto', manifestBytes, limits.maxManifestBytes);
  return manifest;
}
