import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isGreenApiGroupId, normalizeGreenApiGroupDiscovery } from '../lib/messages/greenapi-group-discovery.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('accepts both current and historical GREEN API WhatsApp group IDs', () => {
  assert.equal(isGreenApiGroupId('120363403264951041@g.us'), true);
  assert.equal(isGreenApiGroupId('79001234567-1479621234@g.us'), true);
  for (const value of ['56999999999@c.us', 'hello@g.us', '', null, '123@g.us', '123456789-@g.us', '123456789@g.us.example.com']) {
    assert.equal(isGreenApiGroupId(value), false, String(value));
  }
});

test('finds an inactive group present in Contacts but omitted by activity-ordered Chats', () => {
  const chats = [{ id: '120363403264951041@g.us', name: 'Planta Patagua', type: 'group' }];
  const contacts = [
    { id: '79001234567-1479621234@g.us', name: 'Grupo 2', type: 'group' },
    { id: '56999999999@c.us', name: 'Particular', type: 'user' },
  ];
  const result = normalizeGreenApiGroupDiscovery(chats, contacts);
  assert.equal(result.total, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.groups.map((g) => g.name), ['Grupo 2', 'Planta Patagua']);
  assert.equal(result.groups[0].chatId, '79001234567-1479621234@g.us');
});

test('uses exact group ID to deduplicate and prefers a meaningful chat name', () => {
  const id = '120363403264951041@g.us';
  const result = normalizeGreenApiGroupDiscovery(
    [{ id, name: 'Planta Patagua', type: 'group' }],
    [{ id, name: '', contactName: '', type: 'group' }],
  );
  assert.equal(result.total, 1);
  assert.deepEqual(result.groups, [{ chatId: id, name: 'Planta Patagua' }]);
});

test('returns useful group data when one provider list is unavailable', () => {
  const rows = [{ id: '120363403264951041@g.us', name: 'Grupo 2', type: 'group' }];
  assert.equal(normalizeGreenApiGroupDiscovery(null, rows).total, 1);
  assert.equal(normalizeGreenApiGroupDiscovery(rows, null).total, 1);
  assert.equal(normalizeGreenApiGroupDiscovery(null, null).total, 0);
});

test('bounds output and preserves exact total and truncated signal', () => {
  const groups = Array.from({ length: 7 }, (_, i) => ({
    id: (120363403264951041n + BigInt(i)).toString() + '@g.us',
    name: 'Grupo ' + String(i),
    type: 'group',
  }));
  const result = normalizeGreenApiGroupDiscovery(groups, [], 3);
  assert.equal(result.groups.length, 3);
  assert.equal(result.total, 7);
  assert.equal(result.truncated, true);
});

test('group discovery and activation do not bypass tenant authorization or source membership', () => {
  const route = read('app/api/admin/whatsapp/route.ts');
  const provider = read('lib/messages/greenapi.ts');
  const ui = read('app/dashboard/admin/whatsapp/page.tsx');
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /greenRequest\('getChats'\)/);
  assert.match(route, /greenRequest\('getContacts', \{ group: true \}\)/);
  assert.match(route, /normalizeGreenApiGroupDiscovery\(chats, contacts, 500\)/);
  assert.match(route, /isGreenApiGroupId\(chatId\)/);
  assert.match(route, /greenRequest\('getGroupData', \{ groupId: chatId \}\)/);
  assert.match(route, /details\.groupId !== chatId/);
  assert.match(route, /existing\.organization_id\s*!==\s*ctx\.organizationId/);
  assert.match(route, /\.eq\('organization_id',ctx\.organizationId\)/);
  assert.match(provider, /method === 'getContacts' && payload\.group === true/);
  assert.match(provider, /endpoint \+ '\?group=true'/);
  assert.match(provider, /const isGet = method === 'getChats' \|\| method === 'getContacts'/);
  assert.match(ui, /Buscar grupos/);
  assert.match(ui, /Filtrar grupos/);
  assert.match(ui, /Verifica que el número vinculado a la instancia sea participante/);
});
