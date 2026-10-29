import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const scorecard = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

test('value scorecard measures the maintenance to procurement handoff without inventing missing stages', () => {
  assert.match(scorecard, /work_order_supply_needs/);
  assert.match(scorecard, /canonical_procurement_requests_v1/);
  assert.match(scorecard, /procurement_operational_orders/);
  assert.match(scorecard, /procurement_operational_receipts/);
  assert.match(scorecard, /shortageToRequest/);
  assert.match(scorecard, /requestToOrder/);
  assert.match(scorecard, /orderToReceipt/);
  assert.match(scorecard, /endToEnd/);
  assert.match(scorecard, /missing stages remain unmeasured and are not treated as zero/);
});

test('supply cycle remains observed timing, not savings', () => {
  assert.doesNotMatch(scorecard, /supplyCycle[^\n]{0,200}savings/i);
  assert.match(scorecard, /observed handoff/);
});

test('value scorecard measures unique no-purchase decisions without calling exposure savings', () => {
  assert.match(scorecard, /supply_need_no_purchase_decision/);
  assert.match(scorecard, /uniqueNoPurchaseDecisions/);
  assert.match(scorecard, /estimatedExposureReviewedClp/);
  assert.match(scorecard, /not realized savings or avoided cost until outcome closure/);
});
