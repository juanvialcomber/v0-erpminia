import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto';

type PushKeys = { p256dh: string; auth: string };
type Subscription = { endpoint: string; keys: PushKeys };
const decode = (value: string) => Buffer.from(value, 'base64url');
const encode = (value: Buffer) => value.toString('base64url');

function hkdf(salt: Buffer, input: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(input).digest();
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  for (let i = 1; output.length < length; i += 1) {
    previous = createHmac('sha256', prk).update(Buffer.concat([previous, info, Buffer.from([i])])).digest();
    output = Buffer.concat([output, previous]);
  }
  return output.subarray(0, length);
}


export type WebPushConfigError = 'missing_config' | 'invalid_public_key' | 'invalid_private_key' | 'key_pair_mismatch' | 'invalid_subject';
export function getWebPushConfigError(env: Record<string, string | undefined> = process.env): WebPushConfigError | null {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY || env.VAPID_PRIVATE_KEY;
  const subject = env.WEB_PUSH_VAPID_SUBJECT || env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return 'missing_config';
  if (!/^[a-zA-Z0-9_-]+$/.test(publicKey)) return 'invalid_public_key';
  const pub = decode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) return 'invalid_public_key';
  if (!/^[a-zA-Z0-9_-]+$/.test(privateKey) || decode(privateKey).length !== 32) return 'invalid_private_key';
  try {
    const signingKey = createECDH('prime256v1');
    signingKey.setPrivateKey(decode(privateKey));
    if (!signingKey.getPublicKey().equals(pub)) return 'key_pair_mismatch';
  } catch { return 'invalid_private_key'; }
  try {
    const contact = new URL(subject);
    if (contact.protocol !== 'https:' && (contact.protocol !== 'mailto:' || !/^[^\s@]+@[^\s@]+$/.test(contact.pathname))) return 'invalid_subject';
  } catch { return 'invalid_subject'; }
  return null;
}

function vapidAuthorization(endpoint: string): string {
  const configError = getWebPushConfigError();
  if (configError) throw new Error(configError);
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error('Web Push VAPID no configurado');
  const pub = decode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4 || decode(privateKey).length !== 32) throw new Error('VAPID inválido');
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: encode(pub.subarray(1, 33)), y: encode(pub.subarray(33, 65)), d: privateKey }, format: 'jwk' });
  const now = Math.floor(Date.now() / 1000);
  const aud = new URL(endpoint).origin;
  const body = [encode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), encode(Buffer.from(JSON.stringify({ aud, exp: now + 12 * 3600, sub: subject })))].join('.');
  const signature = sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + body + '.' + encode(signature) + ', k=' + publicKey;
}

function encryptPayload(subscription: Subscription, message: string): Buffer {
  const userPublic = decode(subscription.keys.p256dh);
  const authSecret = decode(subscription.keys.auth);
  if (userPublic.length !== 65 || userPublic[0] !== 4 || authSecret.length < 16) throw new Error('Suscripción Web Push inválida');
  const sender = createECDH('prime256v1');
  sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const shared = sender.computeSecret(userPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\\0'.replace('\\0', '\0')), userPublic, senderPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const plain = Buffer.concat([Buffer.from(message, 'utf8'), Buffer.from([2])]);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(Math.max(4096, encrypted.length + 1));
  return Buffer.concat([salt, rs, Buffer.from([senderPublic.length]), senderPublic, encrypted]);
}

export async function sendWebPush(subscription: Subscription, payload: { title: string; body: string; url: string; receipt?: { testId: string; token: string } }) {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:' || !['443', ''].includes(endpoint.port)) throw new Error('Endpoint Web Push inseguro');
  const authorization = vapidAuthorization(endpoint.href);
  const ciphertext = encryptPayload(subscription, JSON.stringify(payload));
  const response = await fetch(endpoint.href, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '300',
      'Urgency': 'high',
    },
    body: new Uint8Array(ciphertext),
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  return { status: response.status, ok: response.ok, expired: response.status === 404 || response.status === 410 };
}
