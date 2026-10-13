import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync('components/maintenance/work-order-execution-panel.tsx','utf8');
const api=readFileSync('app/api/maintenance/work-orders/[id]/execution/route.ts','utf8');
test('assigned mechanic is not misrepresented as zero technicians',()=>{assert.match(ui,/Personal asignado/);assert.match(ui,/workOrder.assigned_to_name/);assert.match(ui,/Horas de mano de obra sin registrar/);});
test('print includes material requirements and warehouse parts regardless of reconciliation',()=>{assert.match(api,/work_order_material_requirements/);assert.match(api,/enrichedMaterials/);assert.match(ui,/materialRequirements.map/);assert.match(ui,/parts.map\(part/);});
test('unvalued work is not represented as a zero cost',()=>{assert.match(ui,/Pendiente de valorización/);});

test('report does not repeat timekeeping as a labor section',()=>{assert.doesNotMatch(ui,/>Mano de obra<\/p>/);assert.match(ui,/Tiempo total ejecutado/);});
