import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { data, error } = await context.supabase.rpc('motil_weather_summary_v1', {
      p_organization_id: context.organizationId,
    });
    if (error || !Array.isArray(data)) {
      return NextResponse.json({ error: 'No fue posible consultar el clima' }, { status: 503, headers });
    }
    return NextResponse.json({ sites: data }, { headers });
  } catch {
    return NextResponse.json({ error: 'No fue posible consultar el clima' }, { status: 503, headers });
  }
}
