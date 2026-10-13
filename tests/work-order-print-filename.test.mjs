import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync('components/maintenance/work-order-execution-panel.tsx','utf8');
test('Print name is derived from completion date, OT number and title',()=>{
 assert.match(code,/workOrder\.completion_date \|\| workOrder\.scheduled_date/);
 assert.match(code,/workOrder\.work_order_number/);
 assert.match(code,/workOrder\.title/);
 assert.match(code,/document\.title =/);
 assert.match(code,/afterprint/);
});
