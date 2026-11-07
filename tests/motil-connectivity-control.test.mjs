import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync(new URL('../app/api/maintenance/connectivity/route.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/dashboard/mantenimiento/conectividad/page.tsx',import.meta.url),'utf8');
const media=readFileSync(new URL('../lib/messages/greenapi-media.ts',import.meta.url),'utf8');
const areas=readFileSync(new URL('../app/dashboard/mantenimiento/areas/page.tsx',import.meta.url),'utf8');

test('connectivity control covers Laudus WhatsApp Gmail and production source health',()=>{
  assert.match(route,/laudus_source_status_service_v1/);
  assert.match(route,/motil_whatsapp_daily_reports/);
  assert.match(route,/motil_email_source_manifest/);
  assert.match(route,/production_source_documents/);
  assert.match(route,/quantity_mismatches/);
  assert.match(route,/missing_in_motil_nonzero/);
  assert.match(page,/Control de fuentes/);
  assert.match(page,/una llamada exitosa por sí sola no basta/i);
  assert.match(areas,/mantenimiento\/conectividad/);
});

test('terminal WhatsApp download failures no longer remain in the vision queue',()=>{
  assert.match(media,/const terminal = permanent \|\| exhausted/);
  assert.match(media,/scan_status: 'manual'/);
  assert.match(media,/source_unavailable_for_scan/);
  assert.match(route,/download_status','stored'/);
  assert.match(route,/unavailable','unsupported/);
});
