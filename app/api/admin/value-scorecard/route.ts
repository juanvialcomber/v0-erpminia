export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const ADMIN_ROLES = new Set(['admin','superadmin','super_admin']);

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!ADMIN_ROLES.has(String(context.role || '').toLowerCase())) {
    return NextResponse.json({ error: 'Solo administración puede ver Valor MOTIL.' }, { status: 403 });
  }

  const [
    laudusSuppliers,
    laudusOrders,
    laudusInvoices,
    matchReviews,
    supplyDecisions,
    supplyOutcomes,
    valueEvidence,
    supplyRisk,
  ] = await Promise.all([
    context.supabase.from('laudus_suppliers').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId),
    context.supabase.from('laudus_purchase_orders').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId),
    context.supabase.from('laudus_purchase_invoices').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId),
    context.supabase.from('laudus_match_review_decisions').select('decision,review_duration_ms,score').eq('organization_id',context.organizationId).limit(1000),
    context.supabase.from('procurement_supply_risk_decisions').select('decision,reason_code,decided_at').eq('organization_id',context.organizationId).limit(1000),
    context.supabase.from('procurement_supply_risk_outcomes').select('outcome,risk_score_before,risk_score_after,time_to_outcome_ms').eq('organization_id',context.organizationId).limit(1000),
    context.supabase.from('procurement_supply_value_evidence').select('impact_type,observed_value_clp,observed_minutes,evidence_level').eq('organization_id',context.organizationId).limit(1000),
    context.supabase.rpc('motil_supply_risk_preview',{p_organization_id:context.organizationId,p_scope_days:365}),
  ]);

  const sourceErrors=[laudusSuppliers,laudusOrders,laudusInvoices,matchReviews,supplyDecisions,supplyOutcomes,valueEvidence,supplyRisk].filter((x:any)=>x.error);
  if(sourceErrors.length){
    console.error('[admin/value-scorecard]',sourceErrors.map((x:any)=>x.error));
    return NextResponse.json({error:'No fue posible construir el scorecard de valor.'},{status:500});
  }

  const reviews=matchReviews.data||[];
  const decisions=supplyDecisions.data||[];
  const outcomes=supplyOutcomes.data||[];
  const evidence=valueEvidence.data||[];

  const durations=reviews.map((x:any)=>Number(x.review_duration_ms)).filter((x:number)=>Number.isFinite(x)&&x>=0);
  const approved=reviews.filter((x:any)=>x.decision==='approved').length;
  const actionRequired=decisions.filter((x:any)=>x.decision==='action_required').length;
  const positiveOutcomes=outcomes.filter((x:any)=>['resolved','risk_reduced'].includes(x.outcome)).length;
  const riskDrops=outcomes.map((x:any)=>Number(x.risk_score_before)-Number(x.risk_score_after)).filter((x:number)=>Number.isFinite(x));
  const observedMinutes=evidence.map((x:any)=>Number(x.observed_minutes)).filter((x:number)=>Number.isFinite(x)&&x>=0).reduce((a:number,b:number)=>a+b,0);
  const observedValueClp=evidence.map((x:any)=>Number(x.observed_value_clp)).filter((x:number)=>Number.isFinite(x)&&x>=0).reduce((a:number,b:number)=>a+b,0);
  const e3=evidence.filter((x:any)=>x.evidence_level==='E3').length;

  const evidenceLevel=e3>0?'E3':(outcomes.length>0||evidence.length>0)?'E2':'E1';
  const workflowLevel=4;
  const adoptionGate={
    matchCalibration: reviews.length>=20?'PASS':'HOLD',
    supplyOutcomes: outcomes.length>=5?'PASS':'HOLD',
    valueEvidence: e3>=3?'PASS':'HOLD',
  };
  const scaleReady=Object.values(adoptionGate).every((x)=>x==='PASS');

  return NextResponse.json({
    generatedAt:new Date().toISOString(),
    evidenceLevel,
    workflowLevel,
    scaleGate:scaleReady?'SCALE':'CONDITIONAL',
    adoptionGate,
    connectedData:{
      suppliers:laudusSuppliers.count||0,
      purchaseOrders:laudusOrders.count||0,
      purchaseInvoices:laudusInvoices.count||0,
      supplyRiskProducts:supplyRisk.data?.summary?.total_products||0,
      supplySignalsHigh:supplyRisk.data?.summary?.high_risk||0,
      supplySignalsMedium:supplyRisk.data?.summary?.medium_risk||0,
    },
    assistedDecision:{
      matchReviews:reviews.length,
      matchAcceptanceRate:reviews.length?approved/reviews.length:null,
      averageMatchReviewSeconds:durations.length?durations.reduce((a:number,b:number)=>a+b,0)/durations.length/1000:null,
      supplyDecisions:decisions.length,
      supplyActions:actionRequired,
      supplyActionRate:decisions.length?actionRequired/decisions.length:null,
    },
    outcomes:{
      closed:outcomes.length,
      positive:positiveOutcomes,
      positiveRate:outcomes.length?positiveOutcomes/outcomes.length:null,
      averageRiskReduction:riskDrops.length?riskDrops.reduce((a:number,b:number)=>a+b,0)/riskDrops.length:null,
    },
    observedImpact:{
      records:evidence.length,
      e3Records:e3,
      observedMinutes,
      observedValueClp,
      accountingTruth:false,
      auditedSavings:false,
    },
    narrative:{
      demonstrated:[
        'Laudus está conectado a Compras y Finanzas con trazabilidad.',
        'MOTIL prioriza excepciones y riesgos de abastecimiento con reglas explicables.',
        'Existe workflow humano para aprobar/rechazar matches y decidir acciones de abastecimiento.',
      ],
      nextEvidence:[
        reviews.length<20?'Completar 20 revisiones de matching para calibración observada.':null,
        outcomes.length<5?'Cerrar al menos 5 acciones de abastecimiento con resultado.':null,
        e3<3?'Registrar al menos 3 impactos E3 con referencia documental.':null,
      ].filter(Boolean),
    },
  });
}
