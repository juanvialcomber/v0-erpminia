import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('evidence detail opens an accessible modal immediately, not below a long table',()=>{
  const ui=source('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(ui,/setActiveEvidence\(item\);setSelectedEvidence\(null\)/);
  assert.match(ui,/onClick=\{\(\)=>void inspectEvidence\(e\)\}/);
  assert.match(ui,/<Dialog open=\{Boolean\(activeEvidence\)\}/);
  assert.match(ui,/<DialogContent/);
  assert.match(ui,/<DialogTitle>Detalle de evidencia<\/DialogTitle>/);
  assert.match(ui,/<DialogDescription>/);
  assert.match(ui,/onOpenChange=\{\(open\)=>\{if\(!open\)closeEvidence\(\);\}\}/);
  assert.match(ui,/max-h-\[90dvh\]/);
  assert.doesNotMatch(ui,/\{selectedEvidence&&<div className="space-y-3 rounded-lg border p-4"/);
});

test('detail displays real source and original, including honest pending and error states',()=>{
  const ui=source('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(ui,/setEvidenceSource\(data\.source\|\|null\)/);
  assert.match(ui,/role="status"/);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/No se han generado datos canónicos|no se han generado datos canónicos/);
  assert.match(ui,/Archivo está identificado|archivo está identificado/);
  assert.match(ui,/Image unoptimized/);
  assert.match(ui,/\?file=1/);
  assert.match(ui,/selectedEvidence\.sha256/);
  assert.match(ui,/detailSequence\.current/);
});

test('source metadata query stays inside authorized tenant and group',()=>{
  const api=source('app/api/admin/whatsapp/evidence/[id]/route.ts');
  assert.match(api,/await requireAdmin\(request\)/);
  assert.match(api,/\.eq\('organization_id',auth\.organizationId\)\.eq\('id',id\)/);
  assert.match(api,/\.from\('motil_whatsapp_messages'\)/);
  assert.match(api,/\.eq\('organization_id',auth\.organizationId\)\.eq\('group_id',data\.group_id\)/);
  assert.match(api,/\.eq\('id',data\.message_id\)\.maybeSingle\(\)/);
  assert.match(api,/source:source\?/);
  assert.match(api,/slice\(0,4000\)/);
  assert.doesNotMatch(api,/sendMessage|sendFileByUrl/);
});
