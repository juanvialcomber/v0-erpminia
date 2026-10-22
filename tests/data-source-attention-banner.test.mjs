import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const banner = readFileSync(new URL('../components/data/data-source-attention-banner.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/layout/dashboard-shell.tsx', import.meta.url), 'utf8');

test('global source banner stays hidden unless a source needs attention', () => {
  assert.match(banner, /source\.state === 'review' \|\| source\.state === 'offline'/);
  assert.match(banner, /if \(!affected\.length\) return null/);
  assert.doesNotMatch(banner, /source\.state === 'pending'/);
});

test('dashboard shell includes one shared source-attention surface', () => {
  assert.match(shell, /DataSourceAttentionBanner/);
});
