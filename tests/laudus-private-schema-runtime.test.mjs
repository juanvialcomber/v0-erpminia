import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const roots = [
  new URL('../app/api/integrations/laudus/', import.meta.url),
  new URL('../lib/integrations/laudus/', import.meta.url),
];

function filesUnder(rootUrl) {
  const root = rootUrl.pathname;
  const results = [];

  function visit(path) {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const stat = statSync(full);
      if (stat.isDirectory()) visit(full);
      else if (/\.(ts|tsx)$/.test(name)) results.push(full);
    }
  }

  visit(root);
  return results;
}

test('Laudus runtime never addresses private integration or canonical schemas through Data API', () => {
  const offenders = [];

  for (const root of roots) {
    for (const path of filesUnder(root)) {
      const content = readFileSync(path, 'utf8');
      if (
        content.includes(".schema('integration')") ||
        content.includes('.schema("integration")') ||
        content.includes(".schema('canonical')") ||
        content.includes('.schema("canonical")')
      ) {
        offenders.push(path);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
