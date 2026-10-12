import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const PILOT_RECEIPT_WINDOW_MS = 10 * 60 * 1000;
export type PilotReceiptStage = 'received' | 'displayed' | 'clicked' | 'display_failed';
export type PilotReceipt = { testId: string; token: string };
export function createPilotReceipt() {
  const token = randomBytes(32).toString('base64url');
  return { testId: randomUUID(), token, tokenHash: createHash('sha256').update(token).digest('hex') };
}
export function validPilotReceipt(value: unknown): value is PilotReceipt & { stage: PilotReceiptStage } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.testId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.testId) &&
    typeof v.token === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(v.token) &&
    ['received', 'displayed', 'clicked', 'display_failed'].includes(String(v.stage));
}
export function authenticPilotReceipt(token: string, hash: string | null, sentAt: string | null, now = Date.now()) {
  if (!hash || !/^[0-9a-f]{64}$/.test(hash) || !sentAt) return false;
  const age = now - Date.parse(sentAt);
  if (!Number.isFinite(age) || age < 0 || age > PILOT_RECEIPT_WINDOW_MS) return false;
  const digest = createHash('sha256').update(token).digest();
  return timingSafeEqual(digest, Buffer.from(hash, 'hex'));
}
export function pilotReceiptPatch(stage: PilotReceiptStage, timestamp: string) {
  switch (stage) {
    case 'received': return { last_test_received_at: timestamp };
    case 'displayed': return { last_test_displayed_at: timestamp, last_test_display_error: null };
    case 'clicked': return { last_test_clicked_at: timestamp };
    case 'display_failed': return { last_test_display_error: 'notification_api_failed' };
  }
}
