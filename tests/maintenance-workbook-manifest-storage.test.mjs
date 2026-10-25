import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { gzipSync, gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(import.meta.dirname, '..');
const compiled = new Map();
function load(relativePath, injections = {}) {
  if (!compiled.has(relativePath)) compiled.set(relativePath, ts.transpileModule(readFileSync(path.join(root, relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const target = { exports: {} };
  runInNewContext(compiled.get(relativePath), {
    exports: target.exports, Buffer, Response, Uint8Array,
    require(name) {
      if (Object.hasOwn(injections, name)) return injections[name];
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`, injections);
      if (name.startsWith('.')) return load(path.join(path.dirname(relativePath), `${name}.ts`), injections);
      return require(name);
    },
  });
  return target.exports;
}

const evidence = load('lib/maintenance/workbook-evidence.ts');
const storagePath = 'lib/maintenance/workbook-manifest-storage.ts';
const storage = load(storagePath, { '@/lib/maintenance/workbook-evidence': evidence });
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_GZIP_BYTES = 3 * 1024 * 1024;
const plain = (value) => JSON.parse(JSON.stringify(value));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assertInvalid = (action, message) => assert.throws(action, {
  name: 'WorkbookEvidenceError', code: 'STORED_MANIFEST_INVALID', status: 409,
}, message);

function makeManifest() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['00123', 0, false, 'á & ñ · 🚧'],
    [45678.5, 8, true, 'Texto literal'],
  ]);
  sheet.A1.c = [{ a: 'Revisor de prueba', t: 'Conservar el código con sus ceros.' }];
  sheet.A1.l = { Target: 'https://example.invalid/original', Tooltip: 'Origen sintético' };
  sheet.A2.z = 'yyyy-mm-dd hh:mm';
  sheet.E1 = { t: 'n', f: "'Oculta'!A1+B1", v: 0, z: '0.000' };
  sheet.F1 = { t: 'str', f: 'IF(TRUE,"","x")', v: '' };
  sheet.G1 = { t: 'e', f: '1/0', v: 7 };
  sheet['!ref'] = 'A1:G3';
  sheet['!merges'] = [XLSX.utils.decode_range('A3:C3')];
  sheet['!rows'] = [{ hidden: true }];
  sheet['!cols'] = [{ wch: 18, hidden: true }];
  XLSX.utils.book_append_sheet(book, sheet, 'Principal');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[7]]), 'Oculta');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[9]]), 'Muy oculta');
  book.Workbook = {
    Sheets: [{ Hidden: 0 }, { Hidden: 1 }, { Hidden: 2 }],
    Names: [{ Name: 'Importe', Ref: 'Principal!$B$2', Comment: 'Nombre conservado' }],
    WBProps: { date1904: true },
  };
  const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
  return evidence.parseWorkbookEvidence(bytes, 'evidencia-sintética.xlsx');
}

const fixture = makeManifest();
const contextFor = (manifest = fixture) => ({ organizationId: ORG, documentId: DOC, file: plain(manifest.file), counts: plain(manifest.counts) });
const artifactFor = (manifest = fixture) => storage.createWorkbookManifestArtifact(manifest, ORG, DOC);

// Independent encoding is intentional: corrupt-content tests must reach the
// reader with matching checksums instead of failing a superficial hash check.
function packJson(json) {
  const raw = Buffer.isBuffer(json) ? json : Buffer.from(typeof json === 'string' ? json : JSON.stringify(json), 'utf8');
  const bytes = gzipSync(raw);
  const jsonSha256 = digest(raw);
  return {
    bytes,
    descriptor: {
      version: 1, bucket: 'maintenance-workbook-manifests', encoding: 'gzip',
      path: `${ORG}/maintenance/source-workbooks/${DOC}/manifests/${jsonSha256}.json.gz`,
      jsonSha256, jsonByteLength: raw.length,
      gzipSha256: digest(bytes), gzipByteLength: bytes.length,
    },
  };
}

test('sidecar roundtrip preserves every parser field, source XML, cached values and hidden sheets', () => {
  const manifest = plain(fixture);
  const originalJson = JSON.stringify(manifest);
  const { bytes, descriptor, summary } = artifactFor(manifest);
  assert.equal(storage.WORKBOOK_MANIFEST_BUCKET, 'maintenance-workbook-manifests');
  assert.equal(storage.WORKBOOK_MANIFEST_MAX_GZIP_BYTES, MAX_GZIP_BYTES);
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(descriptor.jsonByteLength, Buffer.byteLength(originalJson, 'utf8'));
  assert.equal(descriptor.jsonSha256, digest(Buffer.from(originalJson, 'utf8')));
  assert.equal(descriptor.gzipByteLength, bytes.length);
  assert.equal(descriptor.gzipSha256, digest(bytes));
  assert.equal(descriptor.path, `${ORG}/maintenance/source-workbooks/${DOC}/manifests/${descriptor.jsonSha256}.json.gz`);
  assert.equal(gunzipSync(bytes).toString('utf8'), originalJson);
  assert.deepEqual(plain(storage.parseWorkbookManifestStorage(descriptor, ORG, DOC)), plain(descriptor));
  const restored = storage.decodeWorkbookManifestArtifact(bytes, descriptor, contextFor(manifest));
  assert.equal(JSON.stringify(restored), originalJson);
  assert.equal(JSON.stringify(manifest), originalJson, 'creating and reading the artifact cannot mutate the input');
  assert.deepEqual(plain(restored.sheets.map((sheet) => sheet.visibility)), ['visible', 'hidden', 'veryHidden']);
  const formula = restored.sheets[0].cells.find((cell) => cell.address === 'E1');
  assert.equal(formula.cachedValue, 0);
  assert.equal(formula.sourceXml.formula, "'Oculta'!A1+B1");
  assert.deepEqual(plain(summary), plain(storage.workbookManifestSummary(manifest)));
  assert.deepEqual(plain(summary.file), manifest.file);
  assert.deepEqual(plain(summary.counts), manifest.counts);
  assert.equal(Object.hasOwn(summary, 'sheets'), false, 'the database summary must not carry the cell arrays');
  assert.equal(Object.hasOwn(summary, 'definedNames'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < descriptor.jsonByteLength);
});

test('summary fields remain a snapshot of the archived bytes without sharing mutable input objects', () => {
  const manifest = plain(fixture);
  const { bytes, descriptor, summary } = artifactFor(manifest);
  const snapshot = plain(summary);
  manifest.file.name = 'renamed-after-archiving.xlsx';
  manifest.parser.version = 'changed-after-archiving';
  manifest.counts.cells += 1;
  manifest.fidelity.originalIsAuthority = false;
  assert.deepEqual(plain(summary), snapshot);
  assert.equal(JSON.stringify(storage.decodeWorkbookManifestArtifact(bytes, descriptor, contextFor())), JSON.stringify(fixture));

  const original = plain(fixture);
  const independent = storage.workbookManifestSummary(original);
  independent.file.name = 'summary-only.xlsx';
  independent.parser.version = 'summary-only';
  independent.counts.cells += 1;
  independent.fidelity.originalIsAuthority = false;
  assert.deepEqual(original, plain(fixture), 'editing a summary cannot mutate its source manifest');
});

test('decoding respects a Uint8Array view without reading neighboring bytes from its backing buffer', () => {
  const { bytes, descriptor } = artifactFor();
  const padded = Buffer.concat([Buffer.from('unrelated-prefix'), bytes, Buffer.from('unrelated-suffix')]);
  const view = new Uint8Array(padded.buffer, padded.byteOffset + 16, bytes.length);
  assert.equal(JSON.stringify(storage.decodeWorkbookManifestArtifact(view, descriptor, contextFor())), JSON.stringify(fixture));
});

test('descriptors are bound to the exact bucket, organization, document and content-derived path', () => {
  const { descriptor } = artifactFor();
  const changes = [
    { version: 2 }, { version: '1' }, { bucket: 'module-documents' }, { encoding: 'deflate' },
    { path: descriptor.path.replace(ORG, OTHER_ORG) },
    { path: descriptor.path.replace(DOC, OTHER_DOC) },
    { path: descriptor.path.replace('/manifests/', '/../manifests/') },
    { path: descriptor.path.replace('/manifests/', '/%2e%2e/manifests/') },
    { path: `https://example.invalid/${descriptor.path}` },
    { path: `${descriptor.path}?download=1` },
    { jsonSha256: 'f'.repeat(64) }, { jsonSha256: 'A'.repeat(64) },
    { gzipSha256: 'not-a-sha256' },
  ];
  for (const patch of changes) assertInvalid(() => storage.parseWorkbookManifestStorage({ ...descriptor, ...patch }, ORG, DOC), JSON.stringify(patch));
  for (const value of [null, [], '', {}, { ...descriptor, path: null }]) assertInvalid(() => storage.parseWorkbookManifestStorage(value, ORG, DOC));
  assertInvalid(() => storage.parseWorkbookManifestStorage(descriptor, OTHER_ORG, DOC));
  assertInvalid(() => storage.parseWorkbookManifestStorage(descriptor, ORG, OTHER_DOC));
  assertInvalid(() => storage.workbookManifestStoragePath('../tenant', DOC, descriptor.jsonSha256));
  assertInvalid(() => storage.workbookManifestStoragePath(ORG, '../document', descriptor.jsonSha256));
});

test('descriptor lengths must be positive bounded integers, never trusted as allocation instructions', () => {
  const { descriptor } = artifactFor();
  for (const key of ['jsonByteLength', 'gzipByteLength']) {
    for (const value of [0, -1, 1.5, NaN, Infinity, '100', null]) {
      assertInvalid(() => storage.parseWorkbookManifestStorage({ ...descriptor, [key]: value }, ORG, DOC), `${key}=${value}`);
    }
  }
  assertInvalid(() => storage.parseWorkbookManifestStorage({ ...descriptor, jsonByteLength: MAX_JSON_BYTES + 1 }, ORG, DOC));
  assertInvalid(() => storage.parseWorkbookManifestStorage({ ...descriptor, gzipByteLength: MAX_GZIP_BYTES + 1 }, ORG, DOC));
});

test('both compressed and JSON lengths and hashes are checked before accepting an artifact', () => {
  const { bytes, descriptor } = artifactFor();
  const modified = Buffer.from(bytes);
  modified[Math.floor(modified.length / 2)] ^= 1;
  assertInvalid(() => storage.decodeWorkbookManifestArtifact(modified, descriptor, contextFor()));
  assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, { ...descriptor, gzipByteLength: bytes.length + 1 }, contextFor()));
  assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, { ...descriptor, gzipSha256: '0'.repeat(64) }, contextFor()));
  assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, { ...descriptor, jsonByteLength: descriptor.jsonByteLength + 1 }, contextFor()));
  const differentJsonHash = '1'.repeat(64);
  assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, {
    ...descriptor, jsonSha256: differentJsonHash,
    path: `${ORG}/maintenance/source-workbooks/${DOC}/manifests/${differentJsonHash}.json.gz`,
  }, contextFor()));
});

test('truncated or invalid gzip is rejected even when its compressed checksum and size are consistent', () => {
  const { bytes, descriptor } = artifactFor();
  const invalidHeader = Buffer.from(bytes);
  invalidHeader[0] = 0;
  for (const damaged of [bytes.subarray(0, bytes.length - 8), invalidHeader]) {
    const updated = { ...descriptor, gzipSha256: digest(damaged), gzipByteLength: damaged.length };
    assertInvalid(() => storage.decodeWorkbookManifestArtifact(damaged, updated, contextFor()));
  }
});

test('matching checksums cannot authorize malformed JSON, invalid UTF-8 or an incompatible manifest', () => {
  const invalidUtf8 = Buffer.concat([
    Buffer.from(JSON.stringify({ ...plain(fixture), warnings: ['UTF8_SENTINEL'] }).split('UTF8_SENTINEL')[0]),
    Buffer.from([0xc3, 0x28]),
    Buffer.from(JSON.stringify({ ...plain(fixture), warnings: ['UTF8_SENTINEL'] }).split('UTF8_SENTINEL')[1]),
  ]);
  const malformed = ['{"schemaVersion":', 'null', '[]', invalidUtf8];
  const incompatible = [
    { ...plain(fixture), schemaVersion: 'motil.workbook-evidence.v999' },
    { ...plain(fixture), parser: { name: 'UnverifiedParser', version: '1' } },
    { ...plain(fixture), dateSystem: 'unknown' },
    { ...plain(fixture), dateSystem: 1900 },
    { ...plain(fixture), fidelity: { ...fixture.fidelity, formulasCalculated: true } },
    { ...plain(fixture), warnings: [17] },
    { ...plain(fixture), sheets: null },
    { ...plain(fixture), sheets: plain(fixture.sheets).map((sheet, index) => index === 1 ? { ...sheet, visibility: ['hidden'] } : sheet) },
  ];
  for (const value of [...malformed, ...incompatible]) {
    const { bytes, descriptor } = packJson(value);
    assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, descriptor, contextFor()));
  }
});

test('the decoded original identity and all eight counts must agree with authorized metadata', () => {
  const { bytes, descriptor } = artifactFor();
  const fileChanges = [
    { name: 'otro-original.xlsx' }, { extension: 'xls' },
    { byteLength: fixture.file.byteLength + 1 }, { sha256: 'e'.repeat(64) },
  ];
  for (const patch of fileChanges) {
    const context = contextFor();
    context.file = { ...context.file, ...patch };
    assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, descriptor, context), JSON.stringify(patch));
  }
  assert.equal(Object.keys(fixture.counts).length, 8);
  for (const key of Object.keys(fixture.counts)) {
    const context = contextFor();
    context.counts[key] += 1;
    assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, descriptor, context), key);
  }
  assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, descriptor, { ...contextFor(), counts: null }));
});

test('actual structures are recounted when cells, hidden sheets, names or dependencies disappear', () => {
  const changes = [
    (manifest) => manifest.sheets[0].cells.pop(),
    (manifest) => manifest.sheets.pop(),
    (manifest) => { manifest.sheets[1].visibility = 'visible'; },
    (manifest) => manifest.sheets[0].mergedRanges.pop(),
    (manifest) => manifest.definedNames.pop(),
    (manifest) => { manifest.sheets[0].cells.find((cell) => cell.address === 'E1').hasCachedValue = false; },
    (manifest) => manifest.sheets[0].cells.find((cell) => cell.address === 'E1').dependencies.pop(),
  ];
  for (const change of changes) {
    const partial = plain(fixture);
    change(partial);
    const { bytes, descriptor } = packJson(partial);
    assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, descriptor, contextFor()));
  }
  // Agreement between two summaries is insufficient if both overstate the data.
  for (const key of Object.keys(fixture.counts)) {
    const overstated = plain(fixture);
    overstated.counts[key] += 1;
    const { bytes, descriptor } = packJson(overstated);
    assertInvalid(() => storage.decodeWorkbookManifestArtifact(bytes, descriptor, contextFor(overstated)), key);
  }
});

test('a compressed expansion bomb is stopped inside zlib before a large JSON object is decoded', () => {
  let nativeFailure;
  const guardedStorage = load(storagePath, {
    '@/lib/maintenance/workbook-evidence': evidence,
    'node:zlib': {
      gzipSync,
      gunzipSync(bytes, options) {
        try { return gunzipSync(bytes, options); }
        catch (error) { nativeFailure = error; throw error; }
      },
    },
  });
  const expanded = { ...plain(fixture), warnings: ['x'.repeat(MAX_JSON_BYTES)] };
  const { bytes, descriptor } = packJson(expanded);
  assert.ok(bytes.length < MAX_GZIP_BYTES);
  assert.ok(descriptor.jsonByteLength > MAX_JSON_BYTES);
  const falseClaim = { ...descriptor, jsonByteLength: MAX_JSON_BYTES };
  assertInvalid(() => guardedStorage.decodeWorkbookManifestArtifact(bytes, falseClaim, contextFor()));
  assert.equal(nativeFailure?.code, 'ERR_BUFFER_TOO_LARGE', 'a post-inflation length check would allocate the oversized output first');
});

test('creation rejects the full artifact when JSON or compressed content exceeds its limit', () => {
  const oversizedJson = { ...plain(fixture), warnings: ['x'.repeat(MAX_JSON_BYTES)] };
  assert.throws(() => artifactFor(oversizedJson), {
    name: 'WorkbookEvidenceError', code: 'MANIFEST_STORAGE_LIMIT_EXCEEDED', status: 413,
  });

  // Deterministic high-entropy fixture: large enough after gzip, comfortably
  // smaller than the JSON limit, and independent of confidential originals.
  const entropy = Buffer.alloc(4 * 1024 * 1024);
  let state = 0x12345678;
  for (let index = 0; index < entropy.length; index++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    entropy[index] = state & 0xff;
  }
  const oversizedGzip = { ...plain(fixture), warnings: [entropy.toString('base64')] };
  const json = Buffer.from(JSON.stringify(oversizedGzip));
  assert.ok(json.length < MAX_JSON_BYTES);
  assert.ok(gzipSync(json).length > MAX_GZIP_BYTES);
  assert.throws(() => artifactFor(oversizedGzip), {
    name: 'WorkbookEvidenceError', code: 'MANIFEST_STORAGE_LIMIT_EXCEEDED', status: 413,
  });
});
