import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dataset = JSON.parse(readFileSync('tests/fixtures/hse-grounded-qa.v1.json', 'utf8'));
function run(answers) {
  const dir = mkdtempSync(join(tmpdir(), 'motil-hse-eval-'));
  try {
    const filename = join(dir, 'answers.json');
    writeFileSync(filename, JSON.stringify(answers));
    const result = spawnSync(process.execPath, ['scripts/evaluate-hse-answers.mjs', filename], { encoding: 'utf8' });
    return { status: result.status, output: JSON.parse(result.stdout) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const good = dataset.cases.map(row => ({
  id: row.id,
  answer: row.expectedRule
    ? ({'HSE-Q01':'El jefe de mina mantiene el registro de conductores autorizados.','HSE-Q02':'Todo conductor debe tener licencia interna vigente.','HSE-Q03':'La velocidad máxima es 20 km/h salvo límites menores.'}[row.id])
    : 'No existe evidencia suficiente para afirmar esto ni autorizar operaciones.',
  citations: row.expectedRule ? [{ ruleCode: row.expectedRule, source: dataset.source }] : [],
  abstained: !row.expectedRule,
}));
test('scorer accepts six structured reference answers, without assessing live agent accuracy', () => {
  const result = run(good);
  assert.equal(result.status, 0);
  assert.equal(result.output.passed, 6);
});
test('scorer rejects citation without core factual content', () => {
  const answers = structuredClone(good);
  answers[0].answer = 'El documento indicado responde la pregunta.';
  const result = run(answers);
  assert.equal(result.status, 1);
  assert.equal(result.output.passed, 5);
  assert.equal(result.output.results[0].factualOk, false);
});
test('scorer rejects answers that do not abstain on unsupported cases', () => {
  const answers = structuredClone(good);
  answers[3].abstained = false;
  const result = run(answers);
  assert.equal(result.status, 1);
  assert.equal(result.output.results[3].abstentionOk, false);
});

test('scorer rejects speed limit without stricter posted-condition qualifier', () => {
  const answers = structuredClone(good);
  answers[2].answer = 'La velocidad máxima es 20 km/h.';
  const result = run(answers);
  assert.equal(result.status, 1);
  assert.equal(result.output.results[2].qualifierOk, false);
});
