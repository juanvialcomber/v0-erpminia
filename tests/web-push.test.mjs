import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createECDH, createPublicKey, createDecipheriv, hkdfSync, randomBytes, verify } from 'node:crypto';

const source = readFileSync(new URL('../lib/notifications/web-push.ts', import.meta.url), 'utf8');
const { getWebPushConfigError, sendWebPush } = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

function keys() {
  const key = createECDH('prime256v1');
  key.generateKeys();
  return { key, publicKey: key.getPublicKey().toString('base64url'), privateKey: key.getPrivateKey().toString('base64url') };
}
function config(pair) {
  return { WEB_PUSH_VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:push@example.com' };
}
test('VAPID detects incomplete, malformed and mismatched keys without exposing values', () => {
  const first = keys();
  const second = keys();
  const valid = config(first);
  assert.equal(getWebPushConfigError(valid), null);
  assert.equal(getWebPushConfigError({}), 'missing_config');
  assert.equal(getWebPushConfigError({ ...valid, WEB_PUSH_VAPID_PUBLIC_KEY: 'bad' }), 'invalid_public_key');
  assert.equal(getWebPushConfigError({ ...valid, VAPID_PRIVATE_KEY: 'bad' }), 'invalid_private_key');
  assert.equal(getWebPushConfigError({ ...valid, VAPID_PRIVATE_KEY: second.privateKey }), 'key_pair_mismatch');
  assert.equal(getWebPushConfigError({ ...valid, VAPID_SUBJECT: 'example.com' }), 'invalid_subject');
  assert.equal(getWebPushConfigError({ ...valid, VAPID_SUBJECT: 'mailto:invalid' }), 'invalid_subject');
  assert.equal(getWebPushConfigError({ ...valid, VAPID_SUBJECT: 'https://example.com' }), null);
});
test('canonical variable names also validate', () => {
  const pair = keys();
  assert.equal(getWebPushConfigError({ WEB_PUSH_VAPID_PUBLIC_KEY: pair.publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: pair.privateKey, WEB_PUSH_VAPID_SUBJECT: 'mailto:push@example.com' }), null);
});
test('Web Push request has verifiable VAPID signature and receiver-decryptable payload', async () => {
  const pair = keys();
  const receiver = keys();
  const auth = randomBytes(16);
  const subscription = { endpoint: 'https://push.example.com/device', keys: { p256dh: receiver.publicKey, auth: auth.toString('base64url') } };
  const payload = { title: 'Test', body: 'Personal pilot', url: '/dashboard' };
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  try {
    Object.assign(process.env, config(pair));
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    delete process.env.WEB_PUSH_VAPID_SUBJECT;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, subscription.endpoint);
      assert.equal(options.headers['Content-Encoding'], 'aes128gcm');
      const token = options.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
      assert.equal(token[2], pair.publicKey);
      const parts = token[1].split('.');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
      assert.equal(claims.aud, 'https://push.example.com');
      const pub = pair.key.getPublicKey();
      const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1,33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
      assert.ok(verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')));
      const body = Buffer.from(options.body);
      const salt = body.subarray(0,16);
      assert.equal(body[20], 65);
      const senderPub = body.subarray(21,86);
      const shared = receiver.key.computeSecret(senderPub);
      const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiver.key.getPublicKey(), senderPub]);
      const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
      const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
      const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
      const encrypted = body.subarray(86);
      const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
      decipher.setAuthTag(encrypted.subarray(-16));
      const plain = Buffer.concat([decipher.update(encrypted.subarray(0,-16)), decipher.final()]);
      assert.equal(plain.at(-1), 2);
      assert.deepEqual(JSON.parse(plain.subarray(0,-1)), payload);
      return new Response(null, { status: 201 });
    };
    assert.deepEqual(await sendWebPush(subscription, payload), { status: 201, ok: true, expired: false });
    globalThis.fetch = async () => new Response(null, { status: 403 });
    assert.deepEqual(await sendWebPush(subscription, payload), { status: 403, ok: false, expired: false });
    globalThis.fetch = async () => new Response(null, { status: 410 });
    assert.deepEqual(await sendWebPush(subscription, payload), { status: 410, ok: false, expired: true });
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
});
