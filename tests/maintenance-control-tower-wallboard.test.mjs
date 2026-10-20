import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/maintenance/control-tower-screen.tsx', import.meta.url), 'utf8');

test('maintenance control tower is a true passive full-screen wallboard', () => {
  assert.match(source, /fixed inset-0 z-\[9999\]/);
  assert.match(source, /Solo lectura/);
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
  assert.doesNotMatch(source, /<Button|<Input|<Select|<form|onClick=/);
});

test('maintenance control tower keeps six fixed views and independent refresh cadence', () => {
  for (const label of [
    'Análisis operacional',
    'Equipos detenidos',
    'Mantenciones preventivas',
    'Programación de trabajos',
    'Control general de flota',
    'Indicadores de gestión',
  ]) assert.match(source, new RegExp(label));
  assert.match(source, /const rotationMs = 30_000/);
  assert.match(source, /refreshInterval: 60_000/);
  assert.match(source, /setSlideIndex\(\(current\) => \(current \+ 1\) % slides\.length\)/);
});

test('stopped equipment separates validated state from latest reported signal', () => {
  assert.match(source, /Estado validado/);
  assert.match(source, /Última señal/);
  assert.match(source, /row\.canonicalStatus \|\| 'Sin estado validado'/);
  assert.match(source, /ageLabel\(row\.latestSignalAgeHours\)/);
});

test('wallboard exposes source freshness, live time and rotation countdown', () => {
  assert.match(source, /Hora Santiago/);
  assert.match(source, /Correo mantención/);
  assert.match(source, /WhatsApp vinculado/);
  assert.match(source, /Actualización pantalla/);
  assert.match(source, /Próxima vista en \{secondsToNext\} s/);
});

test('each wallboard view states one dominant operational question', () => {
  for (const question of [
    '¿Qué requiere atención ahora?',
    '¿Qué equipos están detenidos y qué los bloquea?',
    '¿Qué mantenciones están vencidas o próximas?',
    '¿Qué trabajo está atrasado o debe ejecutarse ahora?',
    '¿Dónde está concentrada la atención de la flota?',
    '¿Cómo está respondiendo el área de mantenimiento?',
  ]) assert.equal(source.includes(question), true);
});


test('wallboard uses scoped MOTIL corporate palette and restrained hierarchy', () => {
  const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(source, /motil-control-tower/);
  assert.match(globals, /--tower-copper/);
  assert.match(globals, /--tower-green/);
  assert.match(globals, /--tower-canvas/);
  assert.match(source, /bg-\[var\(--tower-canvas\)\]/);
  assert.match(source, /text-\[var\(--tower-copper\)\]/);
  assert.match(source, /text-\[var\(--tower-green\)\]/);
});

test('analysis view keeps the approved simple information architecture', () => {
  assert.match(source, /Prioridades activas/);
  assert.match(source, /Señales recientes/);
  assert.match(source, /attention\.slice\(0, 5\)/);
  assert.match(source, /signals\.slice\(0, 5\)/);
  assert.doesNotMatch(source, /Prioridades de coordinación/);
  assert.doesNotMatch(source, /Fuentes y cambios recientes/);
});


test('wallboard pins all displayed timestamps to Santiago time', () => {
  assert.match(source, /America\/Santiago/);
  assert.match(source, /Hora Santiago/);
  assert.match(source, /timeZone: SANTIAGO_TIME_ZONE/);
  assert.match(source, /hour12: false/);
});


test('wallboard never truncates operational names or table values', () => {
  assert.doesNotMatch(source, /truncate text-xl font-semibold/);
  assert.doesNotMatch(source, /min-w-0 truncate px-4 py-4/);
  assert.match(source, /whitespace-normal/);
  assert.match(source, /break-words/);
  assert.match(source, /columnTemplate="1\.45fr \.8fr 1\.1fr 1\.5fr \.7fr 1\.25fr"/);
});


test('wallboard translates internal maintenance priority codes into human language', () => {
  assert.match(source, /P1'\) return 'Crítica'/);
  assert.match(source, /P2'\) return 'Alta'/);
  assert.match(source, /P3'\) return 'Media'/);
  assert.match(source, /P4'\) return 'Baja'/);
  assert.match(source, /P5'\) return 'Programable'/);
  assert.match(source, /Urgencia y seguimiento/);
  assert.doesNotMatch(source, /label: priority/);
});

test('wallboard avoids technical abbreviations in visible maintenance labels', () => {
  assert.match(source, /Preventivas vencidas/);
  assert.match(source, /Próxima mantención/);
  assert.match(source, /Estado preventivo/);
  assert.match(source, /Horas planificadas cerradas/);
  assert.match(source, /Horas reales cerradas/);
  assert.match(source, /Productos de Bodega vinculados/);
  assert.doesNotMatch(source, /label="MP vencidas"/);
  assert.doesNotMatch(source, /label="HH /);
  assert.doesNotMatch(source, /label="SKUs /);
});

test('wallboard charts use MOTIL corporate accents instead of generic chart colors', () => {
  assert.match(source, /bg-\[var\(--tower-copper\)\]/);
  assert.match(source, /bg-\[var\(--tower-green\)\]/);
  assert.doesNotMatch(source, /bg-primary\/75/);
  assert.doesNotMatch(source, /bg-emerald-500\/70/);
});


test('wallboard charts are grounded in real operational counts', () => {
  assert.match(source, /Estado de las preventivas/);
  assert.match(source, /Distribución real de los equipos con seguimiento vigente/);
  assert.match(source, /StatusBars rows=\{preventiveStatusRows\} total=\{rows\.length\}/);
  assert.match(source, /Estado de órdenes registradas/);
  assert.match(source, /Horas de órdenes cerradas/);
  assert.match(source, /Diferencia registrada/);
  assert.doesNotMatch(source, /priorityGroups/);
  assert.doesNotMatch(source, /BarList rows=\{pCounts\}/);
});
