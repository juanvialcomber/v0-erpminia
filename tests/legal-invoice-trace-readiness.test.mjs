import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const lib=await readFile(new URL('../lib/legal/contract-invoice-trace-sync.ts',import.meta.url),'utf8');
const route=await readFile(new URL('../app/api/legal/invoice-trace-readiness/route.ts',import.meta.url),'utf8');
const page=await readFile(new URL('../app/dashboard/legal/pagos-facturas/page.tsx',import.meta.url),'utf8');

test('Legal can inspect trace readiness without calling Laudus or mutating staging',()=>{
 assert.match(lib,/options: \{ recover\?: boolean \} = \{\}/);
 assert.match(lib,/if \(options\.recover === false\)/);
 assert.match(lib,/dryRun: true/);
 assert.match(route,/recover: false/);
 assert.match(route,/no_external_calls: true/);
 assert.match(route,/no_canonical_mutation: true/);
});

test('Legal trace readiness is scoped to Legal access and exact contractual evidence',()=>{
 assert.match(route,/MODULE_KEYS\.LEGAL_MODULO/);
 assert.match(lib,/LEGAL_PROGRESS_MILESTONES/);
 assert.match(lib,/supplierTaxByExternalId/);
 assert.match(lib,/Number\(row\.total_amount \|\| 0\) > 0/);
});

test('Elias sees identified, traced and pending invoice coverage in MOTIL',()=>{
 assert.match(page,/Trazabilidad contractual/);
 assert.match(page,/Identificadas/);
 assert.match(page,/Con traza/);
 assert.match(page,/Pendientes/);
 assert.match(page,/\/api\/legal\/invoice-trace-readiness/);
});
