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
  assert.match(source, /Estado confirmado/);
  assert.match(source, /Última señal/);
  assert.match(source, /row\.canonicalStatus \|\| 'Sin confirmación registrada'/);
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
  assert.match(source, /columnTemplate="1\.8fr \.75fr 1\.15fr 1\.45fr \.65fr 1\.2fr"/);
});


test('wallboard translates internal maintenance priority codes into human language', () => {
  assert.match(source, /startsWith\('P1'\)\) return 'Crítica'/);
  assert.match(source, /startsWith\('P2'\)\) return 'Alta'/);
  assert.match(source, /startsWith\('P3'\)\) return 'Media'/);
  assert.match(source, /startsWith\('P4'\)\) return 'Baja'/);
  assert.match(source, /startsWith\('P5'\)\) return 'Programable'/);
  assert.match(source, /Estado de las preventivas/);
  assert.doesNotMatch(source, /label: priority/);
});

test('wallboard avoids technical abbreviations in visible maintenance labels', () => {
  assert.match(source, /Preventivas vencidas/);
  assert.match(source, /Próxima mantención/);
  assert.match(source, /Estado preventivo/);
  assert.match(source, /Horas de órdenes cerradas/);
  assert.match(source, /MetricBar label="Reales"/);
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


test('wallboard turns coordination and fleet into TV-legible real-data charts', () => {
  assert.match(source, /Carga abierta real por responsable/);
  assert.match(source, /AssigneeLoadChart rows=\{coordination\.slice\(0, 4\)\}/);
  assert.match(source, /Tipo de trabajo terminado/);
  assert.match(source, /WorkMixChart preventive=\{preventive\} corrective=\{corrective\}/);
  assert.match(source, /text-lg font-semibold/);
  assert.match(source, /site\.total\} equipos registrados/);
  assert.match(source, /site\.stopped\} detenidos/);
  assert.match(source, /site\.unknown\} sin estado confirmado/);
  assert.doesNotMatch(source, /truncate text-base font-semibold/);
});


test('wallboard typography follows MOTIL corporate hierarchy', () => {
  assert.match(source, /font-heading text-4xl font-semibold/);
  assert.match(source, /font-heading text-xl font-semibold/);
  assert.match(source, /font-heading text-2xl font-semibold/);
  assert.doesNotMatch(source, /text-\[10px\]/);
  assert.doesNotMatch(source, /text-\[11px\]/);
  assert.doesNotMatch(source, /text-xs/);
});


test('wallboard uses plain language for confirmed equipment state', () => {
  assert.match(source, /Estado confirmado/);
  assert.match(source, /Sin confirmación registrada/);
  assert.doesNotMatch(source, /Estado validado/);
  assert.doesNotMatch(source, /Sin estado validado/);
});


test('wallboard routes dashboard entry to standalone monitor', async () => {
  const route = readFileSync(new URL('../app/dashboard/mantenimiento/torre-control/page.tsx', import.meta.url), 'utf8');
  assert.match(route, /redirect\('\/monitor\/mantenimiento'\)/);
});


test('wallboard fits viewport and disables internal scrolling', () => {
  assert.match(source, /fixed inset-0 z-\[9999\]/);
  assert.match(source, /h-\[100dvh\]/);
  assert.match(source, /min-h-0 flex-1 overflow-hidden rounded-lg/);
  assert.doesNotMatch(source, /overflow-y-auto overscroll-contain/);
});
