import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shell = await readFile(new URL('../components/layout/dashboard-shell.tsx', import.meta.url), 'utf8');
const viewerMode = await readFile(new URL('../lib/maintenance/viewer-mode.ts', import.meta.url), 'utf8');
const maintenanceHome = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');
const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');

test('field maintenance executors enter through assigned-work maintenance home', () => {
  assert.match(shell, /resolveMaintenanceViewerMode\(user\?\.cargo \|\| null\)/);
  assert.match(shell, /pathname !== '\/dashboard'/);
  assert.match(shell, /router\.replace\('\/dashboard\/mantenimiento'\)/);
});

test('execution routing reuses the canonical maintenance viewer-mode resolver', () => {
  assert.match(viewerMode, /cargo\.startsWith\('mecánico'\)/);
  assert.match(viewerMode, /cargo\.startsWith\('jefe de taller mina'\)/);
  assert.match(viewerMode, /cargo === 'encargado de camionetas y camiones'/);
  assert.match(viewerMode, /cargo === 'soldador'/);
  assert.match(viewerMode, /return 'execution'/);
});

test('execution maintenance home is the assigned-work surface at every viewport', () => {
  assert.match(maintenanceHome, /if \(mode === 'execution'\) \{/);
  assert.match(maintenanceHome, /<MobileTerrainPanel\b[^>]*\/>/);
  assert.match(maintenanceHome, /max-w-xl/);
  assert.doesNotMatch(maintenanceHome, /mode==='execution' \? 'hidden md:block'/);
  assert.doesNotMatch(maintenanceHome, /md:hidden"><MobileTerrainPanel/);
});

test('execution profiles cannot browse the general work-order queue', () => {
  assert.match(proxy, /resolveMaintenanceViewerMode/);
  assert.match(proxy, /request\.cookies\.get\('user_cargo'\)/);
  assert.match(proxy, /pathname === '\/dashboard\/mantenimiento\/ordenes-trabajo'/);
  assert.match(proxy, /resolveMaintenanceViewerMode\(cargoName\) === 'execution'/);
  assert.match(proxy, /NextResponse\.redirect\(new URL\('\/dashboard\/mantenimiento'/);
});
