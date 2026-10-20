import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('October mineral extraction is an independent read-only, tenant-scoped source',()=>{
  const api=read('app/api/produccion/source-cutoff/route.ts');
  assert.match(api,/requireModuleAccess\(request,MODULE_KEYS\.PROD_OPERACIONES\)/);
  assert.match(api,/getOrganizationContext\(request\)/);
  assert.match(api,/production_source_documents/);
  assert.match(api,/\.eq\('organization_id',ctx\.organizationId\)/);
  assert.match(api,/\.eq\('source_file_sha256',doc\.source_file_sha256\)/);
  assert.match(api,/\.eq\('semantic_status','source_reported'\)/);
  assert.match(api,/extraction_actual_peumo/);
  assert.match(api,/extraction_actual_don_jaime/);
  assert.match(api,/stock_week_consumption_plant/);
  assert.match(api,/stock_week_transport_total/);
  assert.match(api,/snapshot_balance/);
  assert.match(api,/source_reported/);
  assert.doesNotMatch(api,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.doesNotMatch(api,/production_metallurgy_results|production_plant_shifts/);
});

test('source panel labels new extraction correctly, preserving old assay dates',()=>{
  const ui=read('components/production/plant-source-cutoff.tsx');
  const page=read('components/production/plant-metallurgy-dashboard.tsx');
  assert.match(ui,/Datos hasta:/);
  assert.match(ui,/Mineral extraído a planta/);
  assert.match(ui,/Extracción de mina, no mineral tratado/);
  assert.match(ui,/Los datos de planta se muestran aparte/);
  assert.match(ui,/Extracción y stock no son lo mismo que producción de cobre fino/);
  assert.match(page,/WhatsappOperationalUpdates mode="plant"/);
  assert.match(page,/PlantSourceCutoff/);
  assert.match(page,/Producción diaria · histórico de planta/);
  assert.match(page,/Últimos turnos/);
  assert.match(page,/b\.operationDate\.localeCompare\(a\.operationDate\)/);
  assert.match(page,/data\.recent\.map/);
});
