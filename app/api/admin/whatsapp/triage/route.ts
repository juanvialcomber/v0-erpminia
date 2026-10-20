export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { GREEN_NO_STORE, greenDb } from '@/lib/messages/greenapi';
import { prepareWhatsappTriage } from '@/lib/messages/whatsapp-triage.mjs';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';
import { redactDisallowedWhatsappReports, isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId) {
    return auth.response || NextResponse.json({
      error:'Acceso denegado a clasificación de mensajes',
    }, {status:403, headers:GREEN_NO_STORE});
  }
  if (!whatsappOperationalReviewEnabled()) {
    return NextResponse.json({error:'Revisión operacional pendiente de habilitación'},
      {status:503,headers:GREEN_NO_STORE});
  }
  const date = request.nextUrl.searchParams.get('date') || '';
  if (!DATE.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z'))) {
    return NextResponse.json({error:'Fecha de informe inválida'},{
      status:400,headers:GREEN_NO_STORE,
    });
  }
  const db = greenDb();
  const {data:report,error:reportError} = await db.from('motil_whatsapp_daily_reports')
    .select('id,report_date,status,message_count,findings,truncated,generated_at,summary')
    .eq('organization_id',auth.organizationId)
    .eq('report_date',date).maybeSingle();
  if (reportError) return NextResponse.json({error:'Error al consultar informe'},
    {status:503,headers:GREEN_NO_STORE});
  if (!report) return NextResponse.json({error:'No hay informe para esta fecha'},
    {status:404,headers:GREEN_NO_STORE});

  // A cached AI finding may reference sources that were later disabled.
  // Compare the source-scope timestamps and redact the historical analysis
  // before returning it through this new endpoint.
  const { data: sourceGroups, error: scopeError } = await db.from('motil_whatsapp_groups')
    .select('enabled,updated_at,chat_id').eq('organization_id',auth.organizationId).limit(100);
  if (scopeError || !sourceGroups || sourceGroups.length >= 100) return NextResponse.json({error:'No se pudo comprobar el alcance completo de los grupos'},
    {status:503,headers:GREEN_NO_STORE});
  if (sourceGroups.some(group => group.enabled && isExcludedMotilWhatsappGroup(group.chat_id))) {
    return NextResponse.json({error:'La configuración contiene una fuente excluida; revisión bloqueada'},
      {status:409,headers:GREEN_NO_STORE});
  }
  const [scopedReport] = redactDisallowedWhatsappReports([report],sourceGroups||[]);
  // This canonical SQL function filters by organization and enabled source
  // groups. Read-only triage covers source messages, not only AI findings.
  const {data:messages,error:sourceError} = await db.rpc('motil_whatsapp_daily_evidence',{
    p_organization_id:auth.organizationId,p_report_date:date,p_limit:251,
  });
  if (sourceError || !Array.isArray(messages)) {
    return NextResponse.json({error:'No se pudo consultar el origen de los mensajes'},
      {status:503,headers:GREEN_NO_STORE});
  }
  const truncated=messages.length>250;
  const routed=prepareWhatsappTriage(messages,
    !scopedReport.source_scope_stale && Array.isArray(scopedReport.findings)
      ? scopedReport.findings : [],{limit:250});

  const {data:reviewRows,error:reviewError}=await db
    .from('motil_whatsapp_operational_activities')
    .select('message_id,item_index,review_status,reviewed_at')
    .eq('organization_id',auth.organizationId)
    .eq('operation_date',date)
    .limit(1000);
  if(reviewError)return NextResponse.json({error:'No se pudo consultar la revisión humana'},
    {status:503,headers:GREEN_NO_STORE});

  const reviewsByFinding=new Map<number,Array<{status:string;reviewedAt:string|null}>>();
  for(const row of reviewRows||[]){
    const index=Number(row.item_index);
    if(!Number.isSafeInteger(index)||index<0)continue;
    const rows=reviewsByFinding.get(index)||[];
    rows.push({status:String(row.review_status||''),reviewedAt:row.reviewed_at||null});
    reviewsByFinding.set(index,rows);
  }
  const findings=routed.findings.map((finding:any)=>{
    const reviews=reviewsByFinding.get(finding.index)||[];
    if(!reviews.length)return finding;
    const statuses=[...new Set(reviews.map(row=>row.status))];
    const reviewStatus=statuses.length===1?statuses[0]:'needs_more_info';
    const reviewedAt=reviews.map(row=>row.reviewedAt).filter(Boolean).sort().at(-1)||null;
    return {...finding,reviewStatus,reviewedAt};
  });

  return NextResponse.json({
    reportDate:date,reportStatus:scopedReport.status,
    scopeStale:scopedReport.source_scope_stale,
    sourceCountAtReport:scopedReport.message_count,
    sourceCountNow:messages.length,
    sourceMayHaveChanged:scopedReport.source_scope_stale ||
      scopedReport.message_count!==messages.length,
    truncated:truncated||Boolean(report.truncated),
    ...routed,
    findings,
  },{headers:GREEN_NO_STORE});
}
