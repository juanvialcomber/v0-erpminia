import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const screen=readFileSync(new URL('../components/maintenance/control-tower-screen.tsx',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/monitor/mantenimiento/page.tsx',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../public/motil-torre.webmanifest',import.meta.url),'utf8');

test('control tower is hardened for permanent Google TV use',()=>{
  assert.match(screen,/wakeLock/);
  assert.match(screen,/requestFullscreen/);
  assert.match(screen,/safe-area-inset-top/);
  assert.match(screen,/cursor: none/);
  assert.match(screen,/min-width: 3000px/);
  assert.match(screen,/refreshInterval: 60_000/);
  assert.match(screen,/const rotationMs = 30_000/);
});

test('TV manifest opens maintenance monitor fullscreen in landscape',()=>{
  assert.match(page,/motil-torre\.webmanifest/);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.start_url,'/monitor/mantenimiento');
  assert.equal(parsed.display,'fullscreen');
  assert.equal(parsed.orientation,'landscape');
});
