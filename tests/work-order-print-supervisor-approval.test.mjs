import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const api=readFileSync('app/api/maintenance/work-orders/[id]/execution/route.ts','utf8');
const ui=readFileSync('components/maintenance/work-order-execution-panel.tsx','utf8');
test('supervisor approval is fetched from canonical org-scoped review',()=>{assert.match(api,/from\('work_order_supervisor_reviews'\)/);assert.match(api,/supervisorReview: approvalResult/);assert.match(api,/eq\('organization_id',context.organizationId\)/);});
test('final report shows human approver and date only when approved',()=>{assert.match(ui,/supervisorReview\?\.status === 'approved'/);assert.match(ui,/Aprobado por:/);assert.match(ui,/Fecha de aprobación:/);assert.match(ui,/America\/Santiago/);assert.match(ui,/Sin aprobación de supervisor registrada/);});
