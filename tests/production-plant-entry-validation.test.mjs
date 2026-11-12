import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  parsePlantNumber, validatePlantEntry, calculatePlantPreview,
} from '../lib/production/plant-entry-validation.mjs';

const sample = {
  mode: 'plant_metallurgy', operationDate: '2026-11-12', shiftCode: 'A',
  treatedWetMetricTons: '200', mineralMoisturePct: '5',
  headGrade: '1,2', concentrateGrade: '', tailingsGrade: '',
};

test('blank/invalid numbers remain absent, but measured zero remains zero', () => {
  assert.equal(parsePlantNumber(''), null);
  assert.equal(parsePlantNumber('   '), null);
  assert.equal(parsePlantNumber(null), null);
  assert.equal(parsePlantNumber('NaN'), null);
  assert.equal(parsePlantNumber('1e10000'), null);
  assert.equal(parsePlantNumber('0'), 0);
  assert.equal(parsePlantNumber('1,25'), 1.25);
});
test('minimum valid shift preserves the source and optional blanks as null', () => {
  const result = validatePlantEntry(sample);
  assert.equal(result.ok, true);
  assert.equal(result.payload.headGrade, 1.2);
  assert.equal(result.payload.concentrateGrade, null);
  assert.equal(result.payload.dispatchMoisturePct, null);
  assert.equal(result.payload.shiftCode, 'A');
});
test('blank mandatory fields cannot silently become numeric zero', () => {
  for (const field of ['treatedWetMetricTons', 'mineralMoisturePct', 'headGrade']) {
    assert.equal(validatePlantEntry({ ...sample, [field]: '' }).ok, false, field);
  }
  assert.equal(validatePlantEntry({ ...sample, treatedWetMetricTons: '0' }).ok, true);
  assert.equal(validatePlantEntry({ ...sample, operationDate: '2026-02-30' }).ok, false);
  assert.equal(validatePlantEntry({ ...sample, shiftCode: ' ' }).ok, false);
});
test('range checks reject impossible grades, moisture and negative quantities', () => {
  for (const [field, value] of [
    ['headGrade', '101'], ['headGrade', '-1'], ['mineralMoisturePct', '100'],
    ['concentrateGrade', '120'], ['tailingsGrade', '-2'], ['galigherGrade', '101'],
    ['concentrateMoisturePct', '100'], ['dispatchMoisturePct', '-1'],
    ['dispatchGrade', '200'], ['dispatchedMetricTons', '-2'],
    ['concentrateWetMetricTons', '-5'],
  ]) {
    assert.equal(validatePlantEntry({ ...sample, [field]: value }).ok, false, field);
  }
  assert.equal(validatePlantEntry({ ...sample, headGrade: '100', tailingsGrade: '0' }).ok, true);
});
test('preview does not calculate copper when measurement is missing', () => {
  const empty = calculatePlantPreview({});
  assert.equal(empty.mineralDry, null);
  assert.equal(empty.feedFine, null);
  assert.equal(empty.concentrateFine, null);
  assert.equal(empty.gradeRecovery, null);
  const partial = calculatePlantPreview({ treatedWetMetricTons: '', mineralMoisturePct: '2', headGrade: '1' });
  assert.equal(partial.mineralDry, null);
  assert.equal(partial.feedFine, null);
});
test('preview dry basis keeps captured zero distinct from absent fields', () => {
  const derived = calculatePlantPreview(sample);
  assert.equal(derived.mineralDry, 190);
  assert.ok(Math.abs(derived.feedFine - 2.28) < 1e-9);
  assert.equal(derived.concentrateFine, null);
  assert.equal(derived.balanceRecovery, null);
  assert.equal(calculatePlantPreview({ ...sample, mineralMoisturePct: '0' }).mineralDry, 200);
});
test('physical contradictions are flagged for review, not shown as validated recovery', () => {
  const impossible = calculatePlantPreview({
    ...sample, concentrateWetMetricTons: '200', concentrateMoisturePct: '0', concentrateGrade: '50',
    tailingsGrade: '3',
  });
  assert.equal(impossible.gradeRecovery, null);
  assert.equal(impossible.balanceRecovery, null);
  assert.equal(impossible.requiresReview, true);
});
test('both input UI and server use the same fail-closed parser', () => {
  const page = readFileSync(new URL('../app/dashboard/produccion/ingreso-datos/page.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/produccion/data-entry/route.ts', import.meta.url), 'utf8');
  assert.match(page, /validatePlantEntry\(/);
  assert.match(page, /calculatePlantPreview\(plant\)/);
  assert.match(route, /validatePlantEntry\(body\)/);
  assert.match(route, /p_payload: rpcPayload/);
  assert.doesNotMatch(page, /Number\(plant\.headGrade\)/);
  assert.doesNotMatch(page, /function numberOrNull/);
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.PROD_OPERACIONES, true\)/);
  assert.match(route, /create_production_manual_entry_v1/);
  assert.doesNotMatch(route, /\.insert\(/);
});
