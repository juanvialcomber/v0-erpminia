import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import webpush from 'web-push';

test('maintained web-push produces RFC 8291 decryptable aes128gcm payload', () => {
  const receiver = createECDH('prime256v1');
  receiver.generateKeys();
  const auth = randomBytes(16);
  const signing = webpush.generateVAPIDKeys();
  const message = 'MOTIL recipient interoperability';
  const subscription = {
    endpoint: 'https://push.example.com/subscription',
    keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  };
  const request = webpush.generateRequestDetails(subscription, message, {
    vapidDetails: { subject: 'mailto:push@example.com', publicKey: signing.publicKey, privateKey: signing.privateKey },
    TTL: 300,
  });
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  const binary = Buffer.from(request.body);
  const salt = binary.subarray(0, 16);
  const senderPublic = binary.subarray(21, 86);
  assert.equal(binary[20], 65);
  const secret = receiver.computeSecret(senderPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), senderPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, info, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const ciphertext = binary.subarray(86);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const clear = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  assert.equal(clear.at(-1), 2);
  assert.equal(clear.subarray(0, -1).toString(), message);
});
