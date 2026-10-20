import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardUrl = new URL('../components/production/chemistry-dashboard.tsx', import.meta.url);
const plantUrl = new URL('../components/production/plant-metallurgy-dashboard.tsx', import.meta.url);

test('chemistry separates current process assays from historical mine chemistry', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  assert.match(dashboard, /type ViewKey='process'\|'historical'/);
  assert.match(dashboard, /useState<ViewKey>\('process'\)/);
  assert.match(dashboard, /Vista de Química/);
  assert.match(dashboard, />Proceso</);
  assert.match(dashboard, />Mina histórica</);
  assert.match(dashboard, /Dos contextos analíticos separados/);
  assert.match(dashboard, /ensayos operacionales de Planta\/Metalurgia/i);
  assert.match(dashboard, /Muestras especiales 2016–2017 · contexto histórico/);
  assert.match(dashboard, /no son ensayes de sondaje ni ley representativa del plan 2026/i);
  assert.match(dashboard, /No son ensayes de sondaje, no representan la ley del plan 2026/i);
  assert.match(dashboard, /Sector\/Pozo no se fuerzan/);
});

test('process view does not substitute missing assays with historical chemistry', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  assert.match(dashboard, /Sin resultados de proceso en el período/);
  assert.match(dashboard, /No se muestran valores estimados ni se sustituyen ensayos faltantes con química histórica/);
  assert.match(dashboard, /Linaje de proceso/);
  assert.match(dashboard, /Linaje histórico/);
});

test('chemistry owns analytical control while Plant owns metallurgical performance KPIs', async () => {
  const [dashboard, plant] = await Promise.all([
    readFile(dashboardUrl, 'utf8'),
    readFile(plantUrl, 'utf8'),
  ]);

  assert.match(dashboard, /Química controla la evidencia analítica/);
  assert.match(dashboard, /Ley cabeza, recuperación, fino Cu y plan vs ejecución se consolidan en Planta \/ Metalurgia/);
  assert.match(dashboard, /label:'Cobertura analítica'/);
  assert.match(dashboard, /label:'Turnos ensayados'/);
  assert.match(dashboard, /label:'Sin ensayo'/);
  assert.match(dashboard, /label:'Último dato'/);
  assert.doesNotMatch(dashboard, /label:'Ley cabeza Cu'/);
  assert.doesNotMatch(dashboard, /label:'Recuperación'/);
  assert.doesNotMatch(dashboard, /label:'Ley relave'/);

  assert.match(plant, /label:'Ley cabeza Cu'/);
  assert.match(plant, /label:'Recuperación'/);
  assert.match(plant, /label:'Cobre fino'/);
});
