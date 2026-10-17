export const dynamic='force-dynamic';

import {NextRequest,NextResponse} from 'next/server';
import {getOrganizationContext} from '@/lib/api/organization-context';
import {MODULE_KEYS,requireModuleAccess} from '@/lib/api/module-access';

// This is a partial, source-reported snapshot of mine extraction and mineral
// stock, NOT a replacement for assayed plant shifts or certified Cu-fine data.
type NormalizedRecord={record_type:string;period_start:string|null;
  normalized_values:Record<string,unknown>|null};
type SourceDoc={source_file:string;source_file_sha256:string;period_end:string|null};
const finite=(input:unknown):number|null=>
  typeof input==='number'&&Number.isFinite(input)?input:null;
const values=(r:NormalizedRecord|undefined):Record<string,unknown>=>
  r?.normalized_values&&typeof r.normalized_values==='object'?r.normalized_values:{};
const value=(r:NormalizedRecord|undefined):number|null=>finite(values(r).value);
const iso=/^\d{4}-\d{2}-\d{2}$/;
const dailyMap=(r:NormalizedRecord|undefined,cutoff:string|null)=>
  Object.fromEntries(Object.entries(
    (values(r).daily_actual_through_cutoff||{}) as Record<string,unknown>)
    .filter(([date,amount])=>iso.test(date)&&Boolean(cutoff)&&date<=cutoff! &&
      finite(amount)!==null)
    .map(([date,amount])=>[date,finite(amount)])) as Record<string,number>;

export async function GET(request:NextRequest){
  const access=await requireModuleAccess(request,MODULE_KEYS.PROD_OPERACIONES);
  if(!access.authorized)return access.response;
  const ctx=await getOrganizationContext(request);
  if(!ctx.ok)return ctx.response;
  const db=ctx.supabase;
  const [statsDocs,stockDocs]=await Promise.all([
    db.from('production_source_documents')
      .select('source_file,source_file_sha256,period_end')
      .eq('organization_id',ctx.organizationId).eq('canonical_role','canonical')
      .ilike('source_file','ESTADISTICAS DE PRODUCCION %.xlsx')
      .order('period_end',{ascending:false}).limit(1),
    db.from('production_source_documents')
      .select('source_file,source_file_sha256,period_end')
      .eq('organization_id',ctx.organizationId).eq('canonical_role','canonical')
      .ilike('source_file','Nueva stock %.xlsx')
      .order('period_end',{ascending:false}).limit(1),
  ]);
  if(statsDocs.error||stockDocs.error)return NextResponse.json({
    error:'No fue posible consultar los documentos de origen'},
    {status:503,headers:{'Cache-Control':'private, no-store'}});
  const statsDoc=(statsDocs.data?.[0]||null) as SourceDoc|null;
  const stockDoc=(stockDocs.data?.[0]||null) as SourceDoc|null;
  const read=async(doc:SourceDoc|null)=>{
    if(!doc)return {data:[] as NormalizedRecord[],error:null};
    return db.from('production_source_normalized_records')
      .select('record_type,period_start,normalized_values')
      .eq('organization_id',ctx.organizationId)
      .eq('source_file',doc.source_file).eq('source_file_sha256',doc.source_file_sha256)
      .eq('semantic_status','source_reported').limit(100);
  };
  const [statsResult,stockResult]=await Promise.all([read(statsDoc),read(stockDoc)]);
  if(statsResult.error||stockResult.error)return NextResponse.json({
    error:'No fue posible verificar los registros normalizados'},
    {status:503,headers:{'Cache-Control':'private, no-store'}});
  const stats=(statsResult.data||[]) as NormalizedRecord[];
  const stock=(stockResult.data||[]) as NormalizedRecord[];
  const stat=new Map(stats.filter(r=>values(r).cutoff===statsDoc?.period_end)
    .map(r=>[r.record_type,r]));
  const monthPeumo=value(stat.get('extraction_actual_peumo'));
  const monthJaime=value(stat.get('extraction_actual_don_jaime'));
  const planPeumo=value(stat.get('extraction_plan_peumo'));
  const planJaime=value(stat.get('extraction_plan_don_jaime'));
  const monthTotal=monthPeumo===null||monthJaime===null?null:monthPeumo+monthJaime;
  const monthPlan=planPeumo===null||planJaime===null?null:planPeumo+planJaime;

  const sto=new Map(stock.filter(r=>values(r).cutoff===stockDoc?.period_end)
    .map(r=>[r.record_type,r]));
  const findStockRole=(role:string)=>stock.find(r=>
    values(r).cutoff===stockDoc?.period_end&&values(r).role===role);
  const minePeumo=dailyMap(sto.get('stock_week_extraction_peumo'),stockDoc?.period_end||null);
  const mineJaime=dailyMap(sto.get('stock_week_extraction_don_jaime'),stockDoc?.period_end||null);
  const transported=dailyMap(sto.get('stock_week_transport_total'),stockDoc?.period_end||null);
  const consumption=dailyMap(sto.get('stock_week_consumption_plant'),stockDoc?.period_end||null);
  const plantBalance=dailyMap(findStockRole('snapshot_balance'),stockDoc?.period_end||null);
  const dates=[...new Set([...Object.keys(minePeumo),...Object.keys(mineJaime),
    ...Object.keys(transported),...Object.keys(consumption),...Object.keys(plantBalance)])]
    .sort((a,b)=>b.localeCompare(a)).slice(0,7);
  const daily=dates.map(date=>({
    date,peumoTons:minePeumo[date]??null,donJaimeTons:mineJaime[date]??null,
    transportedTons:transported[date]??null,
    // A negative number in the stock sheet is an outflow, not negative
    // tonnes treated. Preserve its sign and source semantics.
    stockConsumptionDeltaTons:consumption[date]??null,
    plantStockTons:plantBalance[date]??null,
  }));
  const snapshot={
    stats:{
      cutoff:statsDoc?.period_end||null,source:statsDoc?.source_file||null,
      periodStart:stats.find(r=>r.record_type==='extraction_actual_peumo')?.period_start||null,
      peumoExtractedTons:monthPeumo,donJaimeExtractedTons:monthJaime,
      totalExtractedTons:monthTotal,plannedToDateTons:monthPlan,
    },
    stock:{
      cutoff:stockDoc?.period_end||null,source:stockDoc?.source_file||null,
      plantStockTons:value(findStockRole('snapshot_balance')),
      totalMineralStockTons:value(findStockRole('snapshot_total')),
      daily,
    },
    coverage:'partial_source_reported',
    note:'Extracción minera y stock informados; no equivalen a tratamiento real, ley, recuperación ni turnos ensayados.',
  };
  return NextResponse.json(snapshot,{headers:{'Cache-Control':'private, no-store'}});
}
