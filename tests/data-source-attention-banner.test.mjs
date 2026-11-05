import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const banner = readFileSync(new URL('../components/data/data-source-attention-banner.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/layout/dashboard-shell.tsx', import.meta.url), 'utf8');

test('global source banner is reserved for real source outages', () => {
  assert.match(banner, /source\.state === 'offline'/);
  assert.doesNotMatch(banner, /source\.state === 'review'/);
  assert.doesNotMatch(banner, /source\.state === 'pending'/);
  assert.match(banner, /if \(!affected\.length\) return null/);
  assert.doesNotMatch(banner, /Hay datos que requieren revisión/);
});

test('global outage banner uses neutral product language', () => {
  assert.match(banner, /Hay una fuente sin conexión/);
  assert.match(banner, /Ver estado/);
  assert.doesNotMatch(banner, /border-amber/);
});

test('dashboard shell includes one shared source-attention surface', () => {
  assert.match(shell, /DataSourceAttentionBanner/);
});
