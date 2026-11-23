import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url), 'utf8');
const queue = await readFile(new URL('../components/maintenance/progressive-work-order-close-queue.tsx', import.meta.url), 'utf8');

test('OT evidence route supports signed direct uploads without weakening authorization', () => {
  assert.match(route, /mode: 'read' \| 'write' = 'write'/);
  assert.match(route, /mode === 'read' && accessLevel === 'LEC' && context\.role !== 'tecnico'/);
  assert.match(route, /authorize\(request, id, 'read'\)/);
  assert.match(route, /createSignedUploadUrl/);
  assert.match(route, /complete_upload/);
  assert.match(route, /requireAssignedMaintenanceExecution/);
  assert.match(route, /requireOperationalMaintenanceWorkOrder/);
  assert.match(route, /storagePath\.startsWith\(expectedPrefix\)/);
  assert.match(route, /execution_evidence_added/);
  assert.doesNotMatch(route, /EVIDENCE_TAGS/);
});

test('read-only maintenance access can view OT evidence but cannot create or complete uploads', () => {
  const getHandler = route.match(/export async function GET[\s\S]*?\n}\n/)?.[0] || '';
  const postHandler = route.match(/export async function POST[\s\S]*$/)?.[0] || '';
  assert.match(getHandler, /authorize\(request, id, 'read'\)/);
  assert.match(postHandler, /authorize\(request, id\)/);
  assert.doesNotMatch(postHandler, /authorize\(request, id, 'read'\)/);
  assert.match(route, /getModuleAccessLevel\(context\.userId, context\.role, MODULE_KEYS\.MANT_OPERACIONES\)/);
});

test('close queue uploads photo directly to Supabase Storage', () => {
  assert.match(queue, /uploadToSignedUrl/);
  assert.match(queue, /action: 'create_upload'/);
  assert.match(queue, /action: 'complete_upload'/);
  assert.match(queue, /multiple/);
  assert.match(queue, /await Promise\.all\(\[mutateEvidence\(\), mutate\(\)\]\)/);
});
