import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { greenConfigured, greenRequest, GREEN_NO_STORE } from '@/lib/messages/greenapi';
import { normalizeGreenApiGroupDiscovery, isGreenApiGroupId } from '@/lib/messages/greenapi-group-discovery.mjs';

export const dynamic = 'force-dynamic';
// Token rotation redeploy marker: 2026-11-04.

function authorized(request: NextRequest) {
  const expected = String(process.env.N3URALIA_TAX_GROUPS_TOKEN || '');
  const candidate = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || !candidate) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!greenConfigured()) return NextResponse.json({ error: 'greenapi_not_configured' }, { status: 503 });

  const [chatResult, contactResult] = await Promise.allSettled([
    greenRequest('getChats'),
    greenRequest('getContacts', { group: true }),
  ]);

  const chats = chatResult.status === 'fulfilled' && Array.isArray(chatResult.value) ? chatResult.value : null;
  const contacts = contactResult.status === 'fulfilled' && Array.isArray(contactResult.value) ? contactResult.value : null;

  if (!chats && !contacts) {
    return NextResponse.json({ error: 'greenapi_groups_unavailable' }, { status: 502, headers: GREEN_NO_STORE });
  }

  const discovered = normalizeGreenApiGroupDiscovery(chats, contacts, 500);
  return NextResponse.json({
    ok: true,
    groups: discovered.groups,
    total: discovered.total,
    truncated: discovered.truncated,
    sources: { chats: Boolean(chats), contacts: Boolean(contacts) },
  }, { headers: GREEN_NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!greenConfigured()) return NextResponse.json({ error: 'greenapi_not_configured' }, { status: 503 });

  const body = await request.json().catch(() => null);
  const chatId = String(body?.chatId || '');
  if (!isGreenApiGroupId(chatId)) return NextResponse.json({ error: 'invalid_group_id' }, { status: 400 });

  try {
    const details = await greenRequest('getGroupData', { groupId: chatId });
    if (!details || typeof details !== 'object' || details.groupId !== chatId) {
      return NextResponse.json({ error: 'group_identity_not_confirmed' }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      group: {
        chatId,
        name: String(details.subject || chatId).trim().slice(0, 120),
      },
    }, { headers: GREEN_NO_STORE });
  } catch {
    return NextResponse.json({ error: 'group_verification_failed' }, { status: 502, headers: GREEN_NO_STORE });
  }
}
