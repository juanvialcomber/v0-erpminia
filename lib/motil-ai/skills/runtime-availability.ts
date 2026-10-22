import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { buildEvidenceState, type SkillEvidenceFacts } from './source-state';
import { buildSkillAvailability } from './availability';

type CountResult = { count: number | null; error: { message: string } | null };

async function exists(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) return false;
  return (result.count ?? 0) > 0;
}

export async function resolveMotilSkillAvailability(context: OrganizationSuccessContext) {
  const org = context.organizationId;

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
    exists(context.supabase.schema('canonical').from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.schema('canonical').from('suppliers').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.from('procurement_supplier_invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.schema('canonical').from('cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.from('procurement_sii_dte_imports').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.from('maintenance_work_orders').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
    exists(context.supabase.from('procurement_intake_requests').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
  ]);

  let laudus: SkillEvidenceFacts['laudus'] = 'pending';
  let laudusFixedAssets = false;

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
        context.supabase
          .schema('integration')
          .from('raw_records')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org)
          .eq('source_id', source.data.id)
          .eq('entity_type', 'fixed_asset'),
        context.supabase
          .schema('integration')
          .from('reconciliation_items')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org)
          .eq('source_id', source.data.id)
          .in('resolution_status', ['pending', 'conflict', 'new_candidate']),
      ]);

      laudusFixedAssets = (fixedAssetCount.count ?? 0) > 0;
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

  const skills = buildSkillAvailability(evidence);

  return {
    evidence,
    skills,
    sourceState: { laudus },
    summary: {
      total: skills.length,
      available: skills.filter((skill) => skill.state === 'available').length,
      degraded: skills.filter((skill) => skill.state === 'degraded').length,
      dormant: skills.filter((skill) => skill.state === 'dormant').length,
    },
  };
}
