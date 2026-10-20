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
  assert.match(source, /Hora local/);
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
