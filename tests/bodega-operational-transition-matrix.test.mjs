import assert from 'node:assert/strict';
import test from 'node:test';

const transitions = [
  { from: 'healthy', to: 'healthy', rows: 8 },
  { from: 'negative', to: 'negative', rows: 1 },
  { from: 'out_of_stock', to: 'healthy', rows: 2 },
  { from: 'out_of_stock', to: 'reorder', rows: 1 },
  { from: 'reorder', to: 'healthy', rows: 5 },
  { from: 'reorder', to: 'negative', rows: 2 },
];

test('the 19 verified Bodega operational deltas reconcile all overview counters', () => {
  assert.equal(transitions.reduce((sum, row) => sum + row.rows, 0), 19);

  const productsWithStockDelta =
    2 + 1 - 2; // three non-positive rows become positive; two positive rows become negative.
  const outOfStockDelta = -(2 + 1);
  const negativeDelta = 2;
  const reorderDelta = 1 - 5 - 2;

  assert.equal(productsWithStockDelta, 1);
  assert.equal(outOfStockDelta, -3);
  assert.equal(negativeDelta, 2);
  assert.equal(reorderDelta, -6);

  assert.deepEqual(
    {
      products_with_stock: [5557, 5558],
      negative_stock_products: [1, 3],
      out_of_stock_products: [6887, 6884],
      reorder_products: [1257, 1251],
    },
    {
      products_with_stock: [5557, 5557 + productsWithStockDelta],
      negative_stock_products: [1, 1 + negativeDelta],
      out_of_stock_products: [6887, 6887 + outOfStockDelta],
      reorder_products: [1257, 1257 + reorderDelta],
    },
  );
});
