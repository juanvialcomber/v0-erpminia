import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const integrationsDir = new URL('../components/integrations/', import.meta.url);
const sourceMark = readFileSync(new URL('../components/integrations/laudus-source-mark.tsx', import.meta.url), 'utf8');
const sourceStrip = readFileSync(new URL('../components/data/data-source-status-strip.tsx', import.meta.url), 'utf8');
const dataQuality = readFileSync(new URL('../app/dashboard/calidad-datos/page.tsx', import.meta.url), 'utf8');

test('Laudus connection mark has explicit visual state and accessible identity', () => {
  assert.match(sourceMark, /Laudus ·/);
  assert.match(sourceMark, /Conectado/);
  assert.match(sourceMark, /aria-label/);
  assert.match(sourceMark, /bg-emerald-500/);
});

test('every Laudus integration card shows the shared connection mark', () => {
  const files = readdirSync(integrationsDir)
    .filter((name) => name.startsWith('laudus-') && name.endsWith('.tsx') && name !== 'laudus-source-mark.tsx');

  assert.ok(files.length >= 8);

  for (const filename of files) {
    const content = readFileSync(new URL(filename, integrationsDir), 'utf8');
    assert.match(content, /LaudusSourceMark/, `${filename} must show Laudus source identity`);
  }
});

test('generic source strips render the Laudus mark and Data Quality reads live Laudus status', () => {
  assert.match(sourceStrip, /source\.key\.toLocaleLowerCase\('es-CL'\) === 'laudus'/);
  assert.match(sourceStrip, /LaudusSourceMark compact/);
  assert.match(dataQuality, /sourceStatus\.source\('laudus'/);
  assert.doesNotMatch(dataQuality, /Se incorporará a esta misma bandeja cuando la API quede habilitada/);
});
