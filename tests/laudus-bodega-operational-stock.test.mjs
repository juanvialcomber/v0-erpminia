import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261029223500_align_laudus_bodega_operational_stock.sql",
  import.meta.url,
);

test("Laudus Bodega alignment keeps warehouse 002 idempotent and stock authority explicit", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /'Bodega Central'/);
  assert.match(sql, /'002'/);
  assert.match(sql, /on conflict \(organization_id, code\) do nothing/i);
  assert.match(sql, /with \(security_invoker = true\)/i);
  assert.match(sql, /r\.laudus_stock as operational_quantity/i);
  assert.match(sql, /r\.motil_stock as legacy_motil_quantity/i);
  assert.match(sql, /then 'legacy_motil_stale'/i);
  assert.match(sql, /then 'laudus_zero_no_motil'/i);
});
