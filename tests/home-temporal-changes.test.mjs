import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const home = fs.readFileSync('components/dashboard/home-decision-priorities.tsx', 'utf8');
const dict = fs.readFileSync('lib/i18n/dictionaries.ts', 'utf8');

test('home keeps priorities and temporal changes as separate surfaces', () => {
  assert.match(home, /decision-cases\/prioritized\?limit=3/);
  assert.match(home, /decision-cases\/changes\?hours=24/);
  assert.match(dict, /casesTitle: 'Qué requiere atención'/);
  assert.match(dict, /changesTitle: 'Cambió desde ayer'/);
  assert.match(home, /slice\(0, 3\)/);
});

test('temporal home copy does not promote changes into impact or priority', () => {
  assert.match(dict, /No significa que tengan mayor impacto o prioridad/);
  assert.doesNotMatch(home, /attention.*change/i);
});
