import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../components/dashboard/daily-review.tsx', import.meta.url);
const dictUrl = new URL('../lib/i18n/dictionaries.ts', import.meta.url);

test('daily review keeps each unavailable source distinct from zero', async () => {
  const source = await readFile(pageUrl, 'utf8');
  const dict = await readFile(dictUrl, 'utf8');

  assert.match(source, /operationalUnavailable/);
  assert.match(source, /alertsUnavailable/);
  assert.match(source, /productionUnavailable/);
  assert.match(source, /maintenanceUnavailable/);
  assert.match(source, /inventoryUnavailable/);
  assert.match(source, /safetyUnavailable/);
  assert.match(dict, /Cada indicador afectado queda sin dato/);
  assert.doesNotMatch(source, /alertStats = alerts\.data\?\.stats \|\| \{ total: 0/);
  assert.doesNotMatch(source, /safety = overview\.data\?\.overview \|\| \{ compliance_score: 0/);
});

test('daily commitments never report all clear when the calendar source failed', async () => {
  const source = await readFile(pageUrl, 'utf8');
  const dict = await readFile(dictUrl, 'utf8');

  assert.match(source, /operationalUnavailable \? \(/);
  assert.match(dict, /Compromisos no disponibles/);
  assert.match(dict, /No se interpreta una falla del calendario como ausencia de pendientes/);
  assert.match(dict, /La fuente operacional respondió y no registra pendientes inmediatos/);
});

test('daily alert KPI respects the alert aggregator source coverage contract', async () => {
  const source = await readFile(pageUrl, 'utf8');
  const dict = await readFile(dictUrl, 'utf8');

  assert.match(source, /sourceStatus\?: \{ available: number; total: number; complete: boolean/);
  assert.match(source, /alertCoveragePartial = alerts\.data\?\.sourceStatus\?\.complete === false/);
  assert.match(dict, /Faltan algunos datos/);
});
