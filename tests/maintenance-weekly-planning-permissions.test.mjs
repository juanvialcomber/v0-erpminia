import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../components/maintenance/weekly-maintenance-planning.tsx', import.meta.url), 'utf8');

test('weekly planning mutations follow canonical OT creation capability', () => {
  assert.match(source, /\/api\/maintenance\/viewer-context/);
  assert.match(source, /canCreateWorkOrder === true/);
  assert.match(source, /canPlanMaintenance && !row\.scheduledWorkOrder/);
  assert.match(source, /canPlanMaintenance \? <Button asChild>/);
});
