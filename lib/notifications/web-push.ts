import { createECDH } from 'node:crypto';
import webpush from 'web-push';

type PushKeys = { p256dh: string; auth: string };
type Subscription = { endpoint: string; keys: PushKeys };
const decode = (value: string) => Buffer.from(value, 'base64url');
const encode = (value: Buffer) => value.toString('base64url');

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

function getVapidDetails() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.VAPID_SUBJECT;
  const error = getWebPushConfigError();
  if (error || !publicKey || !privateKey || !subject) throw new Error(error || 'missing_config');
  return { publicKey, privateKey, subject };
}

export async function sendWebPush(subscription: Subscription, payload: { title: string; body: string; url: string; receipt?: { testId: string; token: string } }) {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:' || !['443', ''].includes(endpoint.port)) throw new Error('Endpoint Web Push inseguro');
  const details = getVapidDetails();
  try {
    const response = await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 300, urgency: 'high', vapidDetails: details, timeout: 10000,
    });
    return { status: response.statusCode, ok: response.statusCode >= 200 && response.statusCode < 300, expired: false };
  } catch (error) {
    const status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
    if (status >= 400 && status <= 599) return { status, ok: false, expired: status === 404 || status === 410 };
    throw error;
  }
}
