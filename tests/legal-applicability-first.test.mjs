import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui=readFileSync('app/dashboard/legal/compliance-360/page.tsx','utf8');
const api=readFileSync('app/api/legal/compliance-360/route.ts','utf8');
test('SERNAGEOMIN obligations are presented as applicability decisions, not presumptive noncompliance',()=>{
 assert.match(ui,/Norma y condiciones de aplicabilidad/);
 assert.match(ui,/Consultar fuente normativa/);
 assert.match(ui,/Por evaluar/);
 assert.match(ui,/No aplica/);
 assert.match(api,/oldMeta\.applicability!=='applicable'/);
 assert.match(api,/no se exigen antecedentes/);
});
