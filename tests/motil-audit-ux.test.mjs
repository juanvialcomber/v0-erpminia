import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const intakeUrl = new URL('../app/dashboard/documentos-gestion/ingesta/page.tsx', import.meta.url);
const docsLayoutUrl = new URL('../app/dashboard/documentos-gestion/layout.tsx', import.meta.url);
const bannerUrl = new URL('../components/data/data-source-attention-banner.tsx', import.meta.url);
const assistantUrl = new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url);
const shellUrl = new URL('../components/layout/dashboard-shell.tsx', import.meta.url);
const homeUrl = new URL('../components/dashboard/dashboard-home.tsx', import.meta.url);

test('document intake is task-first and avoids duplicate local navigation', async () => {
  const [page, layout] = await Promise.all([readFile(intakeUrl, 'utf8'), readFile(docsLayoutUrl, 'utf8')]);

  assert.match(page, /Sube archivos o carpetas y conserva fuente, área y ruta original/);
  assert.match(page, /<Card>/);
  assert.match(layout, /focusedIntake/);
  assert.match(layout, /if \(focusedIntake\) return <>{children}<\/>/);
  assert.match(layout, /flex flex-wrap gap-2/);
  assert.doesNotMatch(layout, /overflow-x-auto pb-1/);
});

test('data attention banner uses correct Spanish plural and a strong action', async () => {
  const banner = await readFile(bannerUrl, 'utf8');

  assert.match(banner, /'revisión' : 'revisiones'/);
  assert.match(banner, /Revisar ahora/);
  assert.doesNotMatch(banner, /revisión\$\{reviewCount === 1 \? '' : 'es'\}/);
});

test('assistant launcher has a reduced operational footprint', async () => {
  const assistant = await readFile(assistantUrl, 'utf8');

  assert.match(assistant, /size-12/);
  assert.match(assistant, /md:size-14/);
  assert.doesNotMatch(assistant, /size-16 items-center justify-center/);
});

test('executive priorities render once and before secondary dashboard content', async () => {
  const [shell, home] = await Promise.all([readFile(shellUrl, 'utf8'), readFile(homeUrl, 'utf8')]);

  assert.doesNotMatch(shell, /HomeDecisionPriorities/);
  assert.equal((home.match(/<HomeDecisionPriorities/g) || []).length, 1);
  assert.match(home, /mode === 'management' && !personaKey/);
});
