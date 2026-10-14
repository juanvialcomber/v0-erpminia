import { readFileSync } from 'node:fs';

const dataset = JSON.parse(readFileSync('tests/fixtures/hse-grounded-qa.v1.json', 'utf8'));
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node scripts/evaluate-hse-answers.mjs <respuestas.json>');
  process.exit(2);
}
const answers = JSON.parse(readFileSync(inputPath, 'utf8'));
if (!Array.isArray(answers)) throw new Error('Se requiere un array de respuestas');
const byId = new Map(answers.map(row => [row.id, row]));
const requiredTerms = {
  'HSE-Q01': ['jefe de mina', 'registro'],
  'HSE-Q02': ['licencia interna', 'vigente'],
  'HSE-Q03': ['20', 'km'],
};
const results = dataset.cases.map(testCase => {
  const answer = byId.get(testCase.id);
  const text = String(answer?.answer || '').toLowerCase();
  const citations = Array.isArray(answer?.citations) ? answer.citations : [];
  const sourceOk = testCase.expectedRule
    ? citations.some(citation => citation.ruleCode === testCase.expectedRule && citation.source === dataset.source)
    : true;
  const abstentionOk = testCase.expectedRule
    ? true
    : answer?.abstained === true;
  const factualOk = !testCase.expectedRule || (requiredTerms[testCase.id] || []).every(term => text.includes(term));
  const noApprovalClaim = !/cumplimiento (certificado|confirmado)|autorizad[oa] automáticamente|aprobado automáticamente/i.test(text);
  const pass = Boolean(answer && sourceOk && factualOk && abstentionOk && noApprovalClaim && text.trim().length);
  return { id: testCase.id, pass, sourceOk, factualOk, abstentionOk, noApprovalClaim, answered: Boolean(text.trim()) };
});
const passed = results.filter(row => row.pass).length;
console.log(JSON.stringify({ passed, total: results.length, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
