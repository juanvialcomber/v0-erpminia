import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Public test vector from RFC 8291 section 5 / appendix A, not deployment credentials.
const source = readFileSync(new URL('../lib/notifications/web-push.ts', import.meta.url), 'utf8');
const fixed = stripTypeScriptTypes(source)
  .replace('sender.generateKeys();', "sender.setPrivateKey(Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'));")
  .replace('const salt = randomBytes(16);', "const salt = Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url');");
const { encryptPayload } = await import('data:text/javascript;base64,' + Buffer.from(fixed + '\nexport { encryptPayload };').toString('base64'));

test('ciphertext exactly matches the published RFC 8291 encryption vector', () => {
  const result = encryptPayload({ keys: {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  } }, 'When I grow up, I want to be a watermelon');
  const expected = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  assert.equal(result.toString('base64url'), expected);
});
