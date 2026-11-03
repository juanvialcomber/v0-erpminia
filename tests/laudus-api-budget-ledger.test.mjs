import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20261029204000_laudus_api_usage_ledger.sql','utf8');
const usage = fs.readFileSync('lib/integrations/laudus/api-usage.ts','utf8');
const client = fs.readFileSync('lib/integrations/laudus/client.ts','utf8');
const smoke = fs.readFileSync('app/api/integrations/laudus/smoke/route.ts','utf8');
const bank = fs.readFileSync('app/api/integrations/laudus/bank-reconciliation/route.ts','utf8');

function routeFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...routeFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

const laudusRoutePaths = [
  ...routeFiles('app/api/cron').filter((file) => file.includes('/laudus-')),
  ...routeFiles('app/api/integrations/laudus'),
];

const laudusExecutionMarker =
  /\b(?:getLaudus(?:ReadOnly)?|listLaudus(?:WithOrderFallback)?|syncLaudus\w*|runLaudus\w*|readLaudusFixedAssetEconomics)\s*\(/;

test('usage ledger is private, daily and service-role only',()=>{
  assert.match(migration,/integration\.laudus_api_usage_daily/);
  assert.match(migration,/unique \(source_id, usage_date\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on integration\.laudus_api_usage_daily from public, anon, authenticated/);
  assert.match(migration,/grant select, insert, update on integration\.laudus_api_usage_daily to service_role/);
  assert.match(migration,/monthly_limit/);
  assert.match(migration,/2000/);
});

test('client records every actual outbound request including failures and login',()=>{
  assert.match(client,/noteLaudusApiRequest\(path, response\.status\)/);
  assert.match(client,/noteLaudusApiRequest\(path, 0\)/);
  assert.match(usage,/endpoint === '\/security\/login'/);
  assert.match(usage,/state\.errors \+= 1/);
});

test('tracking persists through service-role RPC without breaking the business operation',()=>{
  assert.match(usage,/AsyncLocalStorage/);
  assert.match(usage,/motil_record_laudus_api_usage/);
  assert.match(usage,/p_request_count: state\.requests/);
  assert.match(usage,/p_endpoint_counts: state\.endpoints/);
  assert.match(usage,/persistence unavailable/);
});

test('every Laudus route that can execute an outbound read participates in usage tracking',()=>{
  const executionRoutes = laudusRoutePaths
    .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }))
    .filter(({ source }) => laudusExecutionMarker.test(source));

  assert.ok(executionRoutes.length >= 15, 'expected the current Laudus execution surface to be discovered');

  for (const { file, source } of executionRoutes) {
    assert.match(
      source,
      /withLaudusApiUsageTracking/,
      `${file} can execute Laudus reads but is missing usage tracking`,
    );
  }
});


test('usage-tracked routes fail closed when organization context is missing',()=>{
  assert.match(bank,/Organización no disponible/);
  assert.match(smoke,/Organización no disponible/);
});
