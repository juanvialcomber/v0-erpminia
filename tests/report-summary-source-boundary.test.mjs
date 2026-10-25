import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/dashboard/reportes/page.tsx', import.meta.url);

test('reports never render unavailable document summary as zero', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /useState<ReportSummary \| null>\(null\)/);
  assert.match(page, /setSummary\(null\)/);
  assert.match(page, /isLoading \|\| !summary \? '—'/);
  assert.match(page, /summary\?\.status \|\| 'No disponible'/);
  assert.match(page, /Los totales volverán a aparecer cuando se recupere la información/);
  assert.doesNotMatch(page, /useState<ReportSummary>\(\{ total: 0, pending: 0/);
});
