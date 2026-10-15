import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/messages/greenapi-host.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const hostModule = { exports: {} };
runInNewContext(compiled, { exports: hostModule.exports, URL });
const { isAllowedGreenApiHost, greenApiOrigin } = hostModule.exports;

test('Green API allows its instance-specific numeric API host over HTTPS', () => {
  assert.equal(isAllowedGreenApiHost('7107.api.greenapi.com'), true);
  assert.equal(isAllowedGreenApiHost('api.green-api.com'), true);
  assert.equal(isAllowedGreenApiHost('api.greenapi.com'), true);
  assert.equal(isAllowedGreenApiHost('evil.api.greenapi.com'), false);
  assert.equal(isAllowedGreenApiHost('api.greenapi.com.attacker.example'), false);
});

test('Green API base URL must match the instance API host over HTTPS', () => {
  assert.equal(greenApiOrigin('https://7107.api.greenapi.com'), 'https://7107.api.greenapi.com');
  assert.throws(() => greenApiOrigin(undefined), /GREENAPI_API_URL no configurada/);
  assert.throws(() => greenApiOrigin('http://7107.api.greenapi.com'), /GREENAPI_API_URL inválida/);
  assert.throws(() => greenApiOrigin('https://7107.api.greenapi.com/path'), /GREENAPI_API_URL inválida/);
  assert.throws(() => greenApiOrigin('https://7107.api.greenapi.com.attacker.example'), /GREENAPI_API_URL inválida/);
});

const requestSource = readFileSync(new URL('../lib/messages/greenapi.ts', import.meta.url), 'utf8');
const requestCompiled = ts.transpileModule(requestSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function requestHarness(response) {
  const calls = [];
  const api = { exports: {} };
  runInNewContext(requestCompiled, {
    exports: api.exports,
    require(name) {
      if (name === './greenapi-host') return { greenApiOrigin };
      if (name === '@/lib/supabase-server') return {};
      return require(name);
    },
    process: { env: {
      GREENAPI_API_URL: 'https://7107.api.greenapi.com',
      GREENAPI_ID_INSTANCE: '1234567890',
      GREENAPI_API_TOKEN_INSTANCE: 'fixture-api-token',
      GREENAPI_WEBHOOK_TOKEN: 'fixture-webhook-token-not-real-123456',
    } },
    AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); return response; },
  });
  return { request: api.exports.greenRequest, calls };
}
test('chat discovery uses provider GET contract without a request body', async () => {
  const groups = [{ id: '1234567890@g.us', name: 'Fixture group' }];
  const { request, calls } = requestHarness({ ok: true, json: async () => groups });
  assert.deepEqual(await request('getChats'), groups);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].url, 'https://7107.api.greenapi.com/waInstance1234567890/getChats/fixture-api-token');
});
test('instance state probe uses GET without a request body', async () => {
  const { request, calls } = requestHarness({ ok: true, json: async () => ({ stateInstance: 'authorized' }) });
  await request('getStateInstance');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.body, undefined);
});
test('provider rejection remains a failure without disclosing credential URLs', async () => {
  const { request } = requestHarness({ ok: false, status: 401 });
  await assert.rejects(request('getChats'), (error) => {
    assert.equal(error.message, 'Proveedor HTTP 401');
    assert.equal(error.message.includes('fixture-api-token'), false);
    return true;
  });
});

test('history request posts the selected chat and bounded count', async () => {
  const { request, calls } = requestHarness({ ok: true, json: async () => [] });
  await request('getChatHistory', { chatId: '1234567890@g.us', count: 100 });
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { chatId: '1234567890@g.us', count: 100 });
});
const historySource = readFileSync(new URL('../lib/messages/greenapi-history.ts', import.meta.url), 'utf8');
const historyCompiled = ts.transpileModule(historySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const historyModule = { exports: {} };
runInNewContext(historyCompiled, { exports: historyModule.exports });
const { historyMessage } = historyModule.exports;
const selected = { id: 'selected-group', organization_id: 'selected-tenant', chat_id: '1234567890@g.us' };
const incoming = { type: 'incoming', chatId: selected.chat_id, idMessage: 'source-id', timestamp: 1700000000, typeMessage: 'textMessage', textMessage: 'Fixture evidence', senderId: '1234567890@c.us' };
test('history preserves source identity and time, using server-selected tenancy', () => {
  const result = historyMessage({ ...incoming, organization_id: 'attacker', group_id: 'attacker' }, selected);
  assert.equal(result.organization_id, selected.organization_id);
  assert.equal(result.group_id, selected.id);
  assert.equal(result.provider_message_id, incoming.idMessage);
  assert.equal(result.occurred_at, new Date(incoming.timestamp * 1000).toISOString());
  assert.equal(result.body, incoming.textMessage);
});
test('history rejects unrelated chats, deleted messages and outgoing events', () => {
  for (const change of [{chatId:'9999999999@g.us'}, {isDeleted:true}, {type:'outgoing'}, {idMessage:''}, {timestamp:0}, {timestamp:1e20}]) {
    assert.equal(historyMessage({...incoming,...change}, selected), null);
  }
});
test('history extracts captions and quoted text within storage limits', () => {
  const caption = historyMessage({...incoming,textMessage:undefined,typeMessage:'imageMessage',caption:'x'.repeat(11000)},selected);
  assert.equal(caption.body.length,10000);
  const quoted = historyMessage({...incoming,textMessage:undefined,typeMessage:'quotedMessage',extendedTextMessage:{text:'Reply',stanzaId:'quoted-id'}},selected);
  assert.equal(quoted.body,'Reply');
  assert.equal(quoted.quoted_message_id,'quoted-id');
});
