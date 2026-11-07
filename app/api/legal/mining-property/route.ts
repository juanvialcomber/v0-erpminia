export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Santiago', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function daysFromToday(value:string|null, today:string) {
  if(!value) return null;
  const target=new Date(`${value.slice(0,10)}T12:00:00Z`).getTime();
  const base=new Date(`${today}T12:00:00Z`).getTime();
  return Math.round((target-base)/86400000);
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const [{ data, error }, { data: controls, error: controlsError }, { data: royalties, error: royaltiesError }] = await Promise.all([
    context.supabase
    .from('contracts')
    .select('id,contract_number,title,contract_type,status,contract_value,currency,paid_amount,execution_percentage,responsible_area,responsible_person,end_date,review_due_date,contractor_name,property_name,project_name,royalty_rate,guarantee_amount,compliance_status,compliance_notes,file_url,updated_at')
    .eq('organization_id', context.organizationId)
    .or('property_name.not.is.null,royalty_rate.gt.0')
    .order('review_due_date', { ascending: true, nullsFirst: false })
    .order('end_date', { ascending: true, nullsFirst: false })
    .limit(500),
    context.supabase
      .from('mining_property_controls')
      .select('id,mining_property_id,link_status,source_property_name,national_role,tenant_name,contact_name,patent_value_clp_source,patent_payment_clp,patent_payment_status,lease_start_date,lease_end_date,lease_annex_start_date,lease_annex_start_raw,lease_annex_end_date,sernageomin_expiry_date,sernageomin_expiry_raw,servitude_status,powder_magazine_status,source_file,source_file_sha256,source_sheet,source_row')
      .eq('organization_id', context.organizationId)
      .order('source_property_name'),
    context.supabase
      .from('mining_property_royalties')
      .select('mining_property_id,royalty_clp,payment_status')
      .eq('organization_id', context.organizationId)
      .limit(5000),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (controlsError) return NextResponse.json({ error: 'No se pudo cargar control de propiedad minera' }, { status: 503 });
  if (royaltiesError) return NextResponse.json({ error: 'No se pudieron cargar regalías' }, { status: 503 });

  const today=todayKey();
  const royaltyByProperty=new Map<string,{count:number;paid:number;amount:number}>();
  for(const royalty of royalties || []) {
    const id=String(royalty.mining_property_id || '');
    if(!id) continue;
    const current=royaltyByProperty.get(id) || {count:0,paid:0,amount:0};
    current.count += 1;
    current.amount += Number(royalty.royalty_clp || 0);
    if(String(royalty.payment_status || '').toLowerCase()==='paid') current.paid += 1;
    royaltyByProperty.set(id,current);
  }
  const controlItems=(controls || []).map((row)=>{
    const permitDays=daysFromToday(row.sernageomin_expiry_date,today);
    const effectiveLeaseEnd=row.lease_annex_end_date || row.lease_end_date || null;
    const leaseDays=daysFromToday(effectiveLeaseEnd,today);
    const royalty=row.mining_property_id ? royaltyByProperty.get(String(row.mining_property_id)) : null;
    const patentStatus=String(row.patent_payment_status || '').toLowerCase();
    const patentPending=!['pagada','pagado','paid','1'].includes(patentStatus);
    return {
      ...row,
      sernageomin_days_until: permitDays,
      sernageomin_overdue: typeof permitDays==='number' && permitDays < 0,
      sernageomin_due_30: typeof permitDays==='number' && permitDays >= 0 && permitDays <= 30,
      effective_lease_end: effectiveLeaseEnd,
      lease_days_until: leaseDays,
      lease_overdue: typeof leaseDays==='number' && leaseDays < 0,
      patent_pending: patentPending,
      royalty_count: royalty?.count || 0,
      royalty_paid_count: royalty?.paid || 0,
      royalty_amount_clp: royalty?.amount || 0,
    };
  });

  const rows = data || [];
  const items = rows.map((row) => ({
    ...row,
    has_evidence: Boolean(row.file_url),
    pending_amount: Math.max(Number(row.contract_value || 0) - Number(row.paid_amount || 0), 0),
  }));

  return NextResponse.json({
    data: items,
    accessLevel: access,
    controls: controlItems,
    controls_summary: {
      total: controlItems.length,
      exact_links: controlItems.filter((item)=>item.link_status==='exact').length,
      conflicts: controlItems.filter((item)=>item.link_status!=='exact').length,
      sernageomin_overdue: controlItems.filter((item)=>item.sernageomin_overdue).length,
      sernageomin_due_30: controlItems.filter((item)=>item.sernageomin_due_30).length,
      patent_pending: controlItems.filter((item)=>item.patent_pending).length,
      lease_overdue: controlItems.filter((item)=>item.lease_overdue).length,
    },
    summary: {
      total: items.length,
      with_property: items.filter((item) => Boolean(item.property_name)).length,
      with_royalty: items.filter((item) => Number(item.royalty_rate || 0) > 0).length,
      review_due: items.filter((item) => Boolean(item.review_due_date)).length,
      missing_evidence: items.filter((item) => !item.has_evidence).length,
    },
  });
}
