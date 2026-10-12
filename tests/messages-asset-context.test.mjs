import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261012150000_motil_message_asset_contexts.sql');
const guard = read('lib/messages/asset-context.ts');
const api = read('app/api/messages/asset-contexts/route.ts');
const assetCard = read('components/maintenance/asset-communications.tsx');
const assetOverview = read('components/maintenance/asset-360-overview.tsx');
const equipmentPage = read('app/dashboard/mantenimiento/equipos/[id]/ficha/page.tsx');
const vehiclePage = read('app/dashboard/mantenimiento/vehiculos/[id]/ficha/page.tsx');
const chat = read('components/messages/motil-messages.tsx');

test('asset contexts have canonical asset FK, tenant guards, unique links and RLS', () => {
  assert.match(migration, /references canonical\.assets\(id\)/i);
  assert.match(migration, /foreign key \(thread_id, organization_id\)/);
  assert.match(migration, /unique \(organization_id, thread_id, asset_id\)/);
  assert.match(migration, /a\.organization_id = new\.organization_id/);
  assert.match(migration, /t\.organization_id = new\.organization_id/);
  assert.match(migration, /t\.kind = 'direct'/);
  assert.match(migration, /new\.created_by in \(t\.participant_a, t\.participant_b\)/);
  assert.match(migration, /p\.status = 'active'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /alter table canonical\.assets/i);
  assert.doesNotMatch(migration, /insert into public\.motil_message_entries/i);
});

test('the asset guard mirrors the operational 360 maintenance role requirement', () => {
  const assetApi = read('app/api/maintenance/assets/[id]/operational-360/route.ts');
  assert.match(assetApi, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(guard, /getModuleAccessLevel\(profileId, role, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(guard, /access !== 'ED' && access !== 'LEC'/);
  assert.match(guard, /profile\.status !== 'active'/);
  assert.match(guard, /\.eq\('organization_id', ctx\.organizationId\)/);
  assert.match(guard, /\.from\('maintenance_canonical_assets_v1'\)/);
  assert.match(guard, /\.eq\('id', assetId\)/);
});

test('only participants of canonical DMs receive access to their linked assets', () => {
  assert.match(api, /getOrganizationContext\(request\)/);
  assert.match(api, /getAuthorizedChatThread\(ctx, threadId!\)/);
  assert.match(api, /thread\.kind !== 'direct'/);
  assert.match(api, /thread\.participant_a === ctx\.userId \|\| thread\.participant_b === ctx\.userId/);
  assert.match(api, /visibleChatAssetForProfile\(ctx, assetId, ctx\.userId\)/);
  assert.match(api, /visibleChatAssetForProfile\(ctx, assetId, recipientId\)/);
  assert.match(api, /visibleChatAssetForProfile\(ctx, link\.asset_id, ctx\.userId\)/);
  assert.match(api, /onConflict: 'organization_id,thread_key', ignoreDuplicates: true/);
  assert.match(api, /onConflict: 'organization_id,thread_id,asset_id', ignoreDuplicates: true/);
  assert.match(api, /\.eq\('organization_id', ctx\.organizationId\)/);
  assert.doesNotMatch(api, /\.from\('motil_message_entries'\)/);
  assert.doesNotMatch(api, /\.from\('maintenance_work_orders'\)/);
});

test('equipment and vehicle 360 both use the same collapsed asset chat', () => {
  assert.match(assetOverview, /<AssetCommunications assetId=\{asset\.id\} locale=\{locale\} \/>/);
  assert.match(equipmentPage, /<Asset360Overview assetId=\{assetId\} locale=\{locale\}/);
  assert.match(vehiclePage, /<Asset360Overview assetId=\{assetId\} scope="vehiculos" locale=\{locale\}/);
  assert.match(assetCard, /<details ref=\{detailsRef\} id="motil-asset-communications"/);
  assert.match(assetCard, /expanded && assetId/);
  assert.match(assetCard, /<RecipientSearch locale=\{locale\}/);
  assert.match(assetCard, /body: JSON\.stringify\(\{ assetId, recipientId \}\)/);
  assert.match(assetCard, /'\/dashboard\/mensajes\?thread='/);
  assert.match(assetCard, /window\.location\.hash !== '#motil-asset-communications'/);
});

test('chat exposes only authorized asset tags, deep linking to existing ficha', () => {
  assert.match(chat, /\/api\/messages\/asset-contexts\?threadId=/);
  assert.match(chat, /selected\?\.kind === 'direct'/);
  assert.match(chat, /assetContexts\.contexts\.map/);
  assert.match(chat, /\/dashboard\/mantenimiento\/equipos\//);
  assert.match(chat, /\/ficha#motil-asset-communications'/);
  assert.match(chat, /relatedAssets:/);
  assert.match(chat, /\/api\/messages\/work-order-contexts\?threadId=/);
  assert.match(chat, /workOrderContexts\.contexts\.map/);
});
