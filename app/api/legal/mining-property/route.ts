export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const [contractsResult, propertiesResult, royaltiesResult] = await Promise.all([
    context.supabase
      .from('contracts')
      .select('id,contract_number,title,contract_type,status,contract_value,currency,paid_amount,execution_percentage,responsible_area,responsible_person,end_date,review_due_date,contractor_name,property_name,project_name,royalty_rate,guarantee_amount,compliance_status,compliance_notes,file_url,updated_at')
      .eq('organization_id', context.organizationId)
      .or('property_name.not.is.null,royalty_rate.gt.0')
      .order('review_due_date', { ascending: true, nullsFirst: false })
      .limit(500),
    context.supabase
      .from('mining_properties')
      .select('id,representative_name,property_name,patent_value_clp,source_file,source_sheet,source_row,updated_at')
      .eq('organization_id', context.organizationId)
      .order('representative_name')
      .limit(500),
    context.supabase
      .from('mining_property_royalties')
      .select('id,mining_property_id,lot_ref,event_date,tonnes,cu_grade_pct,net_clp,royalty_clp,payment_status,payment_note,destination,notes,source_file,source_sheet,source_row')
      .eq('organization_id', context.organizationId)
      .order('event_date', { ascending: false, nullsFirst: false })
      .limit(2000),
  ]);

  if (contractsResult.error) return NextResponse.json({ error: contractsResult.error.message }, { status: 500 });
  if (propertiesResult.error) return NextResponse.json({ error: propertiesResult.error.message }, { status: 500 });
  if (royaltiesResult.error) return NextResponse.json({ error: royaltiesResult.error.message }, { status: 500 });

  const contractRows = contractsResult.data || [];
  const contracts = contractRows.map((row) => ({
    ...row,
    has_evidence: Boolean(row.file_url),
    pending_amount: Math.max(Number(row.contract_value || 0) - Number(row.paid_amount || 0), 0),
  }));

  const royalties = royaltiesResult.data || [];
  const totalsByProperty = new Map<string, { royalty_clp: number; net_clp: number; tonnes: number; entries: number; paid_entries: number }>();
  for (const row of royalties) {
    const current = totalsByProperty.get(row.mining_property_id) || { royalty_clp: 0, net_clp: 0, tonnes: 0, entries: 0, paid_entries: 0 };
    current.royalty_clp += Number(row.royalty_clp || 0);
    current.net_clp += Number(row.net_clp || 0);
    current.tonnes += Number(row.tonnes || 0);
    current.entries += 1;
    if (row.payment_status === 'paid') current.paid_entries += 1;
    totalsByProperty.set(row.mining_property_id, current);
  }

  const properties = (propertiesResult.data || []).map((property) => ({
    ...property,
    totals: totalsByProperty.get(property.id) || { royalty_clp: 0, net_clp: 0, tonnes: 0, entries: 0, paid_entries: 0 },
  }));

  return NextResponse.json({
    contracts,
    properties,
    royalties,
    accessLevel: access,
    summary: {
      total_contracts: contracts.length,
      properties: properties.length,
      royalty_entries: royalties.length,
      royalties_clp: royalties.reduce((sum, row) => sum + Number(row.royalty_clp || 0), 0),
      net_clp: royalties.reduce((sum, row) => sum + Number(row.net_clp || 0), 0),
      tonnes: royalties.reduce((sum, row) => sum + Number(row.tonnes || 0), 0),
      unpaid_entries: royalties.filter((row) => row.payment_status === 'unpaid').length,
      partial_entries: royalties.filter((row) => row.payment_status === 'partial').length,
    },
  });
}
