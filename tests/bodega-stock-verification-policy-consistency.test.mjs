import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('stock and physical-verification APIs share the same non-mutating policy', async () => {
  const stock = await readFile(new URL('../app/api/bodega/stock/route.ts', import.meta.url), 'utf8');
  const verification = await readFile(new URL('../app/api/bodega/stock-verification/route.ts', import.meta.url), 'utf8');
  const policy = await readFile(new URL('../lib/bodega/stock-verification-policy.ts', import.meta.url), 'utf8');

  assert.match(stock, /STOCK_VERIFICATION_POLICY/);
  assert.match(verification, /STOCK_VERIFICATION_POLICY/);
  assert.match(verification, /verificationPolicy: STOCK_VERIFICATION_POLICY/);
  assert.match(policy, /canonicalMutation: false/);
  assert.match(policy, /sourceOnlyReadOnly: true/);
  assert.match(policy, /physicalCountRequiredForAdjustment: true/);
});
