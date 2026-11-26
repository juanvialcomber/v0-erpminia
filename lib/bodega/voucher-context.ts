import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export async function voucherContext(request: NextRequest) {
  // Operational access is configured per person and organization in MOTIL.
  const context = await getOrganizationContext(request);
  if (!context.ok) return context;
  const { data: profile, error: profileError } = await context.supabase.from('profiles').select('id,status').eq('id', context.userId).eq('organization_id', context.organizationId).eq('status', 'active').maybeSingle();
  const { data: settings, error: settingsError } = await context.supabase.from('warehouse_voucher_settings').select('enabled,deliveries_enabled,weekend_authorizations').eq('organization_id', context.organizationId).maybeSingle();
  const { data: access, error: accessError } = await context.supabase.from('warehouse_voucher_access').select('profile_id,can_request,can_approve,can_deliver,expires_at').eq('organization_id', context.organizationId).eq('profile_id', context.userId).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (profileError || settingsError || accessError) return { ok: false as const, response: NextResponse.json({ error: 'No se pudo comprobar el acceso a vales.' }, { status: 503 }) };
  if (!profile || !settings?.enabled || !access) return { ok: false as const, response: NextResponse.json({ error: 'No tienes una autorización vigente para vales.' }, { status: 403 }) };
  return { ok: true as const, context, access, settings };
}
