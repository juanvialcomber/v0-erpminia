import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/integrations/laudus/discovery-360/route.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');

test('Laudus 360 discovery is admin scoped and never persists data', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /access\.admin/);
  assert.match(route, /persisted: false/);
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/);
});

test('Laudus 360 discovery returns the live spec URL and grouped domains', () => {
  assert.match(route, /specUrl: discovery\.specUrl/);
  assert.match(route, /summarizeLaudusCapabilities/);
  assert.match(route, /capabilityCount/);
});

test('Laudus list client accepts only known roots and list endpoints', () => {
  assert.match(client, /\['\/sales\/', '\/purchases\/', '\/production\/', '\/accounting\/'\]/);
  assert.match(client, /path\.endsWith\('\/list'\)/);
  assert.match(client, /Ruta Laudus list fuera del alcance read-only permitido/);
});
