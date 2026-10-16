import { createHash, timingSafeEqual } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { greenApiOrigin } from './greenapi-host';

export const GREEN_NO_STORE = { 'Cache-Control': 'no-store' };
export function greenInstance() { return process.env.GREENAPI_ID_INSTANCE?.trim() || ''; }
export function greenConfigured() {
  return /^\d{1,20}$/.test(greenInstance()) &&
    Boolean(process.env.GREENAPI_API_TOKEN_INSTANCE) &&
    Boolean(process.env.GREENAPI_WEBHOOK_TOKEN && process.env.GREENAPI_WEBHOOK_TOKEN.length >= 32) &&
    Boolean(process.env.GREENAPI_API_URL?.trim());
}
export function validWebhookToken(candidate: string | null): boolean {
  const expected = process.env.GREENAPI_WEBHOOK_TOKEN;
  if (!expected || expected.length < 32 || !candidate || candidate.length > 1024) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
export async function greenRequest(method: string, payload: Record<string, unknown> = {}) {
  if (!greenConfigured()) throw new Error('Green API no configurada');
  const apiOrigin = greenApiOrigin(process.env.GREENAPI_API_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const isGet = method === 'getChats' || method === 'getContacts' || method === 'getStateInstance';
    // GREEN API supports a server-side group filter on GetContacts. Never
    // download every personal contact to discover operational WhatsApp groups.
    const endpoint = `${apiOrigin}/waInstance${greenInstance()}/${method}/${process.env.GREENAPI_API_TOKEN_INSTANCE}`;
    const url = method === 'getContacts' && payload.group === true ? endpoint + '?group=true' : endpoint;
    const result = await fetch(url, {
      method: isGet ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(isGet ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal, cache: 'no-store',
    });
    if (!result.ok) throw new Error(`Proveedor HTTP ${result.status}`);
    return await result.json();
  } finally { clearTimeout(timeout); }
}
export function greenDb() { return getSupabaseServerClient(); }
export function localDay(date: Date, timeZone = 'America/Santiago') {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
