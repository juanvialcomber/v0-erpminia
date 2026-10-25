import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const searchUrl = new URL('../components/layout/global-search.tsx', import.meta.url);
const reportsUrl = new URL('../app/dashboard/reportes/page.tsx', import.meta.url);

test('global search uses canonical operational names', async () => {
  const source = await readFile(searchUrl, 'utf8');
  assert.match(source, /label: 'Problemas operacionales'.*href: '\/dashboard\/andon'/);
  assert.match(source, /label: 'Calendario operacional'.*href: '\/dashboard\/tareas'/);
  assert.match(source, /label: 'Bodega'.*href: '\/dashboard\/bodega'/);
  assert.doesNotMatch(source, /label: 'Alertas operacionales'/);
  assert.doesNotMatch(source, /label: 'Acciones pendientes'/);
  assert.doesNotMatch(source, /label: 'Bodega e inventario'/);
});

test('reports are presented as a transversal capability, not as procurement', async () => {
  const source = await readFile(reportsUrl, 'utf8');
  assert.match(source, /Documentos y reportes/);
  assert.match(source, /Descarga información de distintas áreas y revisa los documentos pendientes/);
  assert.doesNotMatch(source, /Abastecimiento · Análisis y exportación/);
  assert.match(source, /<ExportReportForm \/>/);
});
