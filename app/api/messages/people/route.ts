export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, profileLabel } from '@/lib/messages/server';

// Search profiles only inside the authenticated user's organization.
// Avoid exposing the whole employee directory to a public/anonymous client.
export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  const raw = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 60);
  const search = raw.replace(/[%_,()\\]/g, '').trim();
  if (search.length < 2) return NextResponse.json({ people: [] }, { headers: CHAT_NO_STORE });

  const { data, error } = await ctx.supabase.from('profiles')
    .select('id,full_name,first_name,last_name,email')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'active')
    .neq('id', ctx.userId)
    .ilike('full_name', '%' + search + '%')
    .order('full_name', { ascending: true })
    .limit(20);
  if (error) {
    console.error('[messages] employee search failed', error.code);
    return NextResponse.json({ error: 'No se pudo buscar personas' }, { status: 503, headers: CHAT_NO_STORE });
  }
  return NextResponse.json({
    people: (data || []).map((person: {
      id: string; full_name: string | null; first_name: string | null;
      last_name: string | null; email: string | null;
    }) => ({ id: person.id, name: profileLabel(person) })),
  }, { headers: CHAT_NO_STORE });
}
