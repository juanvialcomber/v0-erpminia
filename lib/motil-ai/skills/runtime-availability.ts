import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { buildEvidenceState, type SkillEvidenceFacts } from './source-state';
import { buildSkillAvailability } from './availability';

type CountResult = { count: number | null; error: { message: string } | null };
export type SkillRuntimeDomain = 'maintenance' | 'inventory' | 'procurement' | 'finance' | 'data_health' | 'executive';

const emptyCount = (): Promise<CountResult> => Promise.resolve({ count: 0, error: null });

async function exists(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) return false;
  return (result.count ?? 0) > 0;
}

export async function resolveMotilSkillAvailability(
  context: OrganizationSuccessContext,
  allowedDomains: SkillRuntimeDomain[],
) {
  const org = context.organizationId;
  const allowed = new Set(allowedDomains);

  const canMaintenance = allowed.has('maintenance') || allowed.has('executive');
  const canInventory = allowed.has('inventory') || allowed.has('executive');
  const canProcurement = allowed.has('procurement') || allowed.has('executive');
  const canFinance = allowed.has('finance') || allowed.has('executive');
  const canDataHealth = allowed.has('data_health') || allowed.has('executive');
  const canExternal = canMaintenance || canInventory || canProcurement || canFinance || canDataHealth;

  const [
    products,
    suppliers,
    stock,
    purchaseOrders,
    supplierInvoices,
    accountsPayable,
    costCenters,
    dte,
    maintenance,
    assets,
    procurementRequests,
  ] = await Promise.all([
    (canInventory || canProcurement || canMaintenance)
      ? exists(context.supabase.schema('canonical').from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    (canProcurement || canFinance)
      ? exists(context.supabase.schema('canonical').from('suppliers').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    canInventory
      ? exists(context.supabase.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    (canProcurement || canFinance)
      ? exists(context.supabase.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    (canProcurement || canFinance)
      ? exists(context.supabase.from('procurement_supplier_invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    canFinance
      ? exists(context.supabase.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    (canFinance || canProcurement)
      ? exists(context.supabase.schema('canonical').from('cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    (canProcurement || canFinance)
      ? exists(context.supabase.from('procurement_sii_dte_imports').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    canMaintenance
      ? exists(context.supabase.from('maintenance_work_orders').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    canMaintenance
      ? exists(context.supabase.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
    (canProcurement || canMaintenance)
      ? exists(context.supabase.from('procurement_intake_requests').select('id', { count: 'exact', head: true }).eq('organization_id', org))
      : emptyCount().then(() => false),
  ]);

  let laudus: SkillEvidenceFacts['laudus'] = 'pending';
  let laudusFixedAssets = false;

  if (canExternal) {
    try {
      const source = await context.supabase
        .schema('integration')
        .from('external_sources')
        .select('id,enabled')
        .eq('organization_id', org)
        .eq('source_key', 'laudus')
        .maybeSingle();

      if (!source.error && source.data?.enabled) {
        const [run, fixedAssetCount, unresolvedCount] = await Promise.all([
          context.supabase
            .schema('integration')
            .from('sync_runs')
            .select('status')
            .eq('organization_id', org)
            .eq('source_id', source.data.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          canMaintenance
            ? context.supabase
                .schema('integration')
                .from('raw_records')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', org)
                .eq('source_id', source.data.id)
                .eq('entity_type', 'fixed_asset')
            : emptyCount(),
          context.supabase
            .schema('integration')
            .from('reconciliation_items')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org)
            .eq('source_id', source.data.id)
            .in('resolution_status', ['pending', 'conflict', 'new_candidate']),
        ]);

        laudusFixedAssets = canMaintenance && (fixedAssetCount.count ?? 0) > 0;
        const latest = String(run.data?.status || '').toLowerCase();
        const unresolved = unresolvedCount.count ?? 0;

        if (latest === 'running' || latest === 'queued') laudus = 'syncing';
        else if (latest === 'failed') laudus = 'offline';
        else if (latest === 'partial' || unresolved > 0) laudus = 'review';
        else if (latest === 'completed') laudus = 'updated';
      }
    } catch {
      // Laudus intake is optional before its migration and commercial activation.
    }
  }

  const evidence = buildEvidenceState({
    products,
    suppliers,
    stock,
    purchaseOrders,
    supplierInvoices,
    accountsPayable,
    costCenters,
    dte,
    maintenance,
    assets,
    procurementRequests,
    laudus,
    laudusFixedAssets,
  });

  const allSkills = buildSkillAvailability(evidence);
  const skills = allSkills.map((skill) => {
    const visibleByDomain =
      allowed.has('executive') ||
      allowed.has('data_health') ||
      allowed.has(skill.domain as SkillRuntimeDomain) ||
      (skill.domain === 'supplier' && (canProcurement || canFinance)) ||
      (skill.domain === 'asset' && canMaintenance) ||
      (skill.domain === 'integration' && canExternal) ||
      (skill.domain === 'data_quality' && canDataHealth);

    return visibleByDomain
      ? skill
      : {
          ...skill,
          state: 'dormant' as const,
          userVisible: false,
          missingEvidence: skill.evidence,
          missingSyncedData: skill.requiresSyncedData || [],
        };
  });

  return {
    evidence,
    skills,
    sourceState: { laudus },
    summary: {
      total: skills.length,
      available: skills.filter((skill) => skill.userVisible && skill.state === 'available').length,
      degraded: skills.filter((skill) => skill.userVisible && skill.state === 'degraded').length,
      dormant: skills.filter((skill) => skill.userVisible && skill.state === 'dormant').length,
    },
  };
}
