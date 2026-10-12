import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { UUID_PATTERN } from '@/lib/messages/server';

export type ChatLinkedAsset = {
  id: string;
  organization_id: string;
  asset_code: string;
  name: string;
  asset_type: string | null;
  is_active: boolean;
};

/**
 * Mirror the maintenance operational-360 access gate for BOTH participants:
 * active profile in the same organization and MANT_OPERACIONES read access.
 * Never derive actor, role or tenant from browser parameters. Recheck this on
 * every GET: asset access may change after a conversation is linked.
 */
export async function visibleChatAssetForProfile(
  ctx: OrganizationSuccessContext,
  assetId: string,
  profileId: string,
): Promise<ChatLinkedAsset | null> {
  if (!UUID_PATTERN.test(assetId) || !UUID_PATTERN.test(profileId)) return null;

  const { data: profile, error: profileError } = await ctx.supabase.from('profiles')
    .select('id,role,status')
    .eq('id', profileId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.status !== 'active') return null;

  const role = profileId === ctx.userId ? ctx.role : profile.role || undefined;
  const access = await getModuleAccessLevel(profileId, role, MODULE_KEYS.MANT_OPERACIONES);
  if (access !== 'ED' && access !== 'LEC') return null;

  const { data, error } = await ctx.supabase.from('maintenance_canonical_assets_v1')
    .select('id,organization_id,asset_code,name,asset_type,is_active')
    .eq('id', assetId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as ChatLinkedAsset | null;
}
