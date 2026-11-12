'use client';

import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Beaker, Drill, Layers3, MapPinned, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { periodUrl, useDashboardPeriod } from '@/components/dashboard/dashboard-period-provider';
import { GeologiaTodayDecisionBoard } from '@/components/production/geologia-today-decision-board';
import { GeologiaResultsDecisionBoard } from '@/components/production/geologia-results-decision-board';
import { GeologiaPendingDecisionQueue } from '@/components/production/geologia-pending-decision-queue';
import { GeologiaHoleEvidenceReadiness } from '@/components/production/geologia-hole-evidence-readiness';
import { GeologiaHole360 } from '@/components/production/geologia-hole-360';
import { GeologiaMineEvidenceOverview } from '@/components/production/geologia-mine-evidence-overview';

type Hole = {
  id:string; hole_code:string; drilling_domain:string|null; mine_source_id:string|null; mine_sector_id:string|null;
  collar_easting:number|null; collar_northing:number|null; collar_elevation:number|null; coordinate_reference:string|null;
  azimuth_deg:number|null; dip_deg:number|null; planned_depth_m:number|null; drilled_depth_m:number|null; diameter_mm:number|null;
  start_at:string|null; completed_at:string|null; status:string|null; geological_purpose:string|null; operational_purpose:string|null;
  source_type:string|null; source_reference:string|null;
};

type Interval = {
  id:string; drill_hole_id:string; from_m:number; to_m:number; recovery_pct:number|null; rqd_pct:number|null;
  lithology:string|null; alteration:string|null; mineralization:string|null; sample_code:string|null;
  assay_reference:string|null; operational_result:string|null; notes:string|null;
  evidence_class:'operational_source_interval'|'explicit_formal_logging'|'unclassified_interval';
};

type Sample = {
  id:string; sample_code:string; sample_type:string|null; sample_date:string|null; mine_source_id:string|null; mine_sector_id:string|null;
  drill_hole_id:string|null; depth_from_m:number|null; depth_to_m:number|null; source_file:string|null; source_sheet:string|null;
  validation_status:string|null; validation_notes:string|null;
};

type GeologyData = {
  canWrite:boolean;
  summary:{
    mines:number; sectors:number; drillingReports:number; drilledMeters:number; mineLinkCoveragePct:number; sectorLinkCoveragePct:number; holeLinkCoveragePct:number;
    holes:number; canonicalDrilledMeters:number; locatedHoles:number; orientedHoles:number; purposeHoles:number; intervals:number;
    operationalIntervals:number; formalLoggingIntervals:number; unclassifiedIntervals:number; samples:number;
    samplesValidated:number; samplesReview:number; unresolvedLocations:number;
  };
  mines:Array<{ id:string; code:string|null; name:string; status:string|null; sectors:number; drillingReports:number; drilledMeters:number }>;
  holes:Hole[];
  intervals:Interval[];
  samples:Sample[];
  locationReview:Array<{ drill_hole_id:string; hole_code:string; resolution_state:string|null; review_priority:number|null; recommended_action:string|null; proposed_mine_name:string|null; proposed_sector_name:string|null }>;
  recentDrilling:Array<{ id:string; operation_date:string|null; hole_code_raw:string|null; mine_raw:string|null; sector_raw:string|null; drilled_meters:number|null; reconciliation_status:string|null; canonical_mine_source_id:string|null; canonical_mine_sector_id:string|null; canonical_drill_hole_id:string|null }>;
  intelligenceStatus:{ geologicalSamplesCanonical:boolean; assaysCanonical:boolean; drillHolesCanonical:boolean; note:string };
};

const fetcher=async(url:string):Promise<GeologyData>=>{
  const response=await fetch(url,{credentials:'include'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'No fue posible cargar Geología');
  return data;
};

function pct(value:number){return `${value.toLocaleString('es-CL',{maximumFractionDigits:1})}%`;}
function meters(value:number){return `${value.toLocaleString('es-CL',{maximumFractionDigits:0})} m`;}

const GEOLOGIA_360_ENABLED = process.env.NEXT_PUBLIC_MOTIL_GEOLOGIA_360_ENABLED === 'true';

const tabs=[
  ['today','Hoy'],
  ['holes','Mapa y sondajes'],
  ['results','Resultados'],
  ['pending','Pendientes'],
] as const;
type TabKey=typeof tabs[number][0];

function Empty({title,description}:{title:string;description:string}){
  return <div className="rounded-lg border border-dashed bg-muted/10 px-5 py-8 text-center"><p className="font-medium">{title}</p><p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p></div>;
}

function Metric({label,value,detail}:{label:string;value:string|number;detail:string}){
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

export function GeologiaDashboard(){
  const {month}=useDashboardPeriod();
  const {data,error,isLoading,mutate}=useSWR(periodUrl('/api/produccion/geologia',month),fetcher);
  const [tab,setTab]=useState<TabKey>('today');
  const [selectedHoleId,setSelectedHoleId]=useState('');
  useEffect(()=>{

    if (!GEOLOGIA_360_ENABLED) return;
    const holeId=new URLSearchParams(window.location.search).get('hole');
    if(holeId)setSelectedHoleId(holeId);
  },[]);
  const selectHole=(holeId:string)=>{
    setSelectedHoleId(holeId);
    if (!GEOLOGIA_360_ENABLED) return;
    const url=new URL(window.location.href);
    url.searchParams.set('hole',holeId);
    url.searchParams.set('tab','holes');
    window.history.replaceState({},'',url.pathname+url.search+url.hash);
  };
  const [holeSearch,setHoleSearch]=useState('');
  const [selectedMines,setSelectedMines]=useState<Record<string,string>>({});
  const [savingId,setSavingId]=useState<string|null>(null);
  const s=data?.summary;

  const filteredHoles=useMemo(()=>{
    const query=holeSearch.trim().toLowerCase();
    return (data?.holes||[]).filter((hole)=>!query||[hole.hole_code,hole.drilling_domain,hole.status,hole.geological_purpose,hole.operational_purpose].some((v)=>String(v||'').toLowerCase().includes(query)));
  },[data?.holes,holeSearch]);
  const selectedHole=useMemo(()=>selectedHoleId ? data?.holes.find((hole)=>hole.id===selectedHoleId)||null : filteredHoles[0]||null,[data?.holes,filteredHoles,selectedHoleId]);
  const selectedIntervals=useMemo(()=>selectedHole?(data?.intervals||[]).filter((row)=>row.drill_hole_id===selectedHole.id):[],[data?.intervals,selectedHole]);
  const selectedOperationalIntervals=useMemo(()=>selectedIntervals.filter((row)=>row.evidence_class==='operational_source_interval'),[selectedIntervals]);
  const selectedFormalLogging=useMemo(()=>selectedIntervals.filter((row)=>row.evidence_class==='explicit_formal_logging'),[selectedIntervals]);
  const selectedSamples=useMemo(()=>selectedHole?(data?.samples||[]).filter((row)=>row.drill_hole_id===selectedHole.id):[],[data?.samples,selectedHole]);
  const chemistryLinkedToHole=useMemo(()=>(data?.samples||[]).filter((row)=>Boolean(row.drill_hole_id)).length,[data?.samples]);
  const locatedHoles=useMemo(()=>(data?.holes||[]).filter((h)=>h.collar_easting!=null&&h.collar_northing!=null),[data?.holes]);
  const bounds=useMemo(()=>{
    if(!locatedHoles.length)return null;
    const xs=locatedHoles.map((h)=>Number(h.collar_easting));
    const ys=locatedHoles.map((h)=>Number(h.collar_northing));
    return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  },[locatedHoles]);

  async function assignMine(reportId:string){
    const mineId=selectedMines[reportId];
    if(!mineId)return;
    setSavingId(reportId);
    try{
      const response=await fetch('/api/produccion/geologia',{method:'PATCH',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({reportId,mineId})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(result?.error||'No fue posible asignar la mina');
      toast.success(`Registro reconciliado con ${result.mine.name}`);
      setSelectedMines((current)=>{const next={...current};delete next[reportId];return next;});
      await mutate();
    }catch(reason){toast.error(reason instanceof Error?reason.message:'No fue posible asignar la mina');}
    finally{setSavingId(null);}
  }

  const topPending=(data?.locationReview||[]).filter((row)=>!['resolved','verified','matched'].includes(String(row.resolution_state||'').toLowerCase()));
  const unlocated=(data?.holes||[]).filter((h)=>h.collar_easting==null||h.collar_northing==null);
  const noPurpose=(data?.holes||[]).filter((h)=>!h.geological_purpose?.trim());

  return <div className="space-y-6">
    <PageHeader><PageHeaderContent><PageHeaderEyebrow>Producción · La Patagua</PageHeaderEyebrow><PageHeaderTitle>Geología</PageHeaderTitle><PageHeaderDescription>Mesa operativa para convertir evidencia canónica en prioridades, interpretación y acciones geológicas.</PageHeaderDescription></PageHeaderContent></PageHeader>

    {error?<StatePanel tone="error" title="No fue posible cargar Geología" description="Reintenta la consulta." actions={<Button variant="outline" onClick={()=>void mutate()}>Reintentar</Button>} className="min-h-0 py-5"/>:null}

    <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen geológico">
      {[
        {label:'Sondajes',value:s?.holes??'—',detail:s?meters(s.canonicalDrilledMeters):'—',icon:Drill},
        {label:'Ubicados',value:s?`${s.locatedHoles}/${s.holes}`:'—',detail:s?pct(s.holes?s.locatedHoles/s.holes*100:0):'—',icon:MapPinned},
        {label:'Química histórica',value:s?.samples??'—',detail:s?`${chemistryLinkedToHole}/${s.samples} ligados a sondaje`:'—',icon:Beaker},
        {label:'Pendientes',value:s?.unresolvedLocations??'—',detail:'Ubicación / reconciliación',icon:AlertTriangle},
      ].map((m)=>{const Icon=m.icon;return <div key={m.label} className="bg-card px-5 py-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{m.label}</p><Icon className="h-4 w-4 text-muted-foreground"/></div><p className="mt-2 text-2xl font-semibold tracking-tight">{isLoading?'—':m.value}</p><p className="mt-1 text-xs text-muted-foreground">{m.detail}</p></div>})}
    </section>

    <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Vistas de Geología">{tabs.map(([key,label])=><Button key={key} size="sm" variant={tab===key?'default':'ghost'} onClick={()=>setTab(key)}>{label}</Button>)}</nav>

    {data&&tab==='today'?<div className="space-y-5"><GeologiaTodayDecisionBoard summary={data.summary} pending={topPending} chemistryLinkedToHole={chemistryLinkedToHole} onOpenHoles={()=>setTab('holes')} onOpenResults={()=>setTab('results')} onOpenPending={()=>setTab('pending')}/><GeologiaMineEvidenceOverview mines={data.mines} holes={data.holes} samples={data.samples}/></div>:null}

    {data&&tab==='holes'?<div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><p className="font-medium">Mapa de sondajes</p><p className="mt-1 text-sm text-muted-foreground">Vista relativa de collares canónicos. No reemplaza cartografía oficial.</p></div>{bounds?<div className="relative h-[360px] bg-muted/20">{locatedHoles.slice(0,400).map((hole)=>{const width=Math.max(bounds.maxX-bounds.minX,1);const height=Math.max(bounds.maxY-bounds.minY,1);const left=((Number(hole.collar_easting)-bounds.minX)/width)*92+4;const top=(1-(Number(hole.collar_northing)-bounds.minY)/height)*88+6;return <button key={hole.id} title={hole.hole_code} onClick={()=>selectHole(hole.id)} className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background ${selectedHole?.id===hole.id?'bg-primary ring-4 ring-primary/20':'bg-foreground/55'}`} style={{left:`${left}%`,top:`${top}%`}}/>})}<div className="absolute bottom-3 left-3 rounded-md border bg-background/90 px-3 py-2 text-xs text-muted-foreground">{locatedHoles.length} collares visibles</div></div>:<Empty title="Sin collares georreferenciados" description="Cuando existan coordenadas canónicas, los sondajes aparecerán aquí."/>}</section>

        <section className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Sondajes</p><p className="mt-1 text-sm text-muted-foreground">Selecciona un pozo para revisar su ficha, intervalos operacionales y evidencia explícitamente vinculada.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><input value={holeSearch} onChange={(event)=>setHoleSearch(event.target.value)} placeholder="Buscar sondaje" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"/></div></div><div className="max-h-[420px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground backdrop-blur"><tr><th className="px-4 py-3">Pozo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Profundidad</th><th className="px-4 py-3">Ubicación</th></tr></thead><tbody className="divide-y">{filteredHoles.map((hole)=><tr key={hole.id} onClick={()=>setSelectedHoleId(hole.id)} className={`cursor-pointer hover:bg-muted/20 ${selectedHole?.id===hole.id?'bg-muted/30':''}`}><td className="px-4 py-3 font-medium">{hole.hole_code}</td><td className="px-4 py-3">{hole.status||'—'}</td><td className="px-4 py-3 text-right tabular-nums">{hole.drilled_depth_m!=null?meters(Number(hole.drilled_depth_m)):'—'}</td><td className="px-4 py-3 text-xs text-muted-foreground">{hole.collar_easting!=null&&hole.collar_northing!=null?'Ubicado':'Pendiente'}</td></tr>)}</tbody></table></div></section>
      </div>

      <aside className="space-y-5">{selectedHole?<><section className="rounded-lg border bg-card p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-muted-foreground">Ficha del sondaje</p><h2 className="mt-1 text-xl font-semibold">{selectedHole.hole_code}</h2></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{selectedHole.status||'Sin estado'}</span></div><div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm"><Metric label="Profundidad" value={selectedHole.drilled_depth_m!=null?meters(Number(selectedHole.drilled_depth_m)):'—'} detail={selectedHole.planned_depth_m!=null?`Plan ${meters(Number(selectedHole.planned_depth_m))}`:'Sin plan'}/><Metric label="Orientación" value={selectedHole.azimuth_deg!=null?`${selectedHole.azimuth_deg}°`:'—'} detail={selectedHole.dip_deg!=null?`Dip ${selectedHole.dip_deg}°`:'Sin inclinación'}/><Metric label="Collar" value={selectedHole.collar_elevation!=null?`${selectedHole.collar_elevation} m`:'—'} detail={selectedHole.coordinate_reference||'CRS no informado'}/><Metric label="Diámetro" value={selectedHole.diameter_mm!=null?`${selectedHole.diameter_mm} mm`:'—'} detail={selectedHole.drilling_domain||'Sin dominio'}/></div><div className="mt-5 border-t pt-4"><p className="text-xs text-muted-foreground">Propósito geológico</p><p className="mt-1 text-sm">{selectedHole.geological_purpose||'No documentado'}</p></div></section>

        <GeologiaHoleEvidenceReadiness hole={selectedHole} intervalCount={selectedOperationalIntervals.length} sampleCount={selectedSamples.length}/>
        {GEOLOGIA_360_ENABLED ? <GeologiaHole360 holeId={selectedHole.id}/> : null}

        <section className="rounded-lg border bg-card p-5"><div className="flex items-center justify-between"><div><p className="font-medium">Intervalos operacionales por profundidad</p><p className="mt-1 text-sm text-muted-foreground">Evidencia estructurada desde reportes fuente. No equivale a logging geológico formal.</p></div><Layers3 className="h-4 w-4 text-muted-foreground"/></div>{selectedOperationalIntervals.length?<div className="mt-4 space-y-2">{selectedOperationalIntervals.map((row)=><div key={row.id} className="rounded-md border px-3 py-3 text-sm"><div className="flex items-center justify-between gap-3"><p className="font-medium">{row.from_m}–{row.to_m} m</p><span className="text-xs text-muted-foreground">Operacional</span></div>{row.lithology?<><p className="mt-2 text-xs text-muted-foreground">Litología reportada</p><p>{row.lithology}</p></>:null}<div className="mt-2 grid gap-3 text-xs sm:grid-cols-2"><div><span className="text-muted-foreground">Mineralización visual · </span>{row.mineralization||'—'}</div><div><span className="text-muted-foreground">Resultado operacional · </span>{row.operational_result||'—'}</div></div><p className="mt-2 text-xs text-muted-foreground">RQD/recuperación/alteración no se asumen desde este intervalo.</p></div>)}</div>:<div className="mt-4"><Empty title="Sin intervalos operacionales estructurados" description="No hay tramos fuente estructurados para este sondaje. El logging geológico formal se mantiene como una fuente separada y no se inventa."/></div>}{selectedFormalLogging.length?<div className="mt-4 rounded-md border bg-muted/20 px-3 py-3 text-sm"><strong>{selectedFormalLogging.length}</strong> intervalo(s) identificados explícitamente como logging geológico formal.</div>:null}</section>

        <section className="rounded-lg border bg-card p-5"><p className="font-medium">Química vinculada al sondaje</p><p className="mt-1 text-sm text-muted-foreground">{selectedSamples.length} registros químicos asociados explícitamente al pozo.</p>{selectedSamples.length?<div className="mt-4 space-y-2">{selectedSamples.slice(0,8).map((sample)=><div key={sample.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><div><p className="font-medium">{sample.sample_code}</p><p className="text-xs text-muted-foreground">{sample.depth_from_m??'—'}–{sample.depth_to_m??'—'} m</p></div><span className="text-xs text-muted-foreground">{sample.validation_status||'Sin validar'}</span></div>)}</div>:null}</section></>:<Empty title="Sin sondajes" description="No hay sondajes canónicos disponibles para mostrar."/>}</aside>
    </div>:null}

    {data&&tab==='results'?<GeologiaResultsDecisionBoard samples={data.samples} holes={data.holes} samplesValidated={data.summary.samplesValidated} samplesReview={data.summary.samplesReview} assaysCanonical={data.intelligenceStatus.assaysCanonical}/>:null}

    {data&&tab==='pending'?<GeologiaPendingDecisionQueue unlocatedCount={unlocated.length} noPurposeCount={noPurpose.length} samplesReview={data.summary.samplesReview} pending={topPending} recentDrilling={data.recentDrilling} mines={data.mines} canWrite={data.canWrite} selectedMines={selectedMines} savingId={savingId} onSelectMine={(reportId,mineId)=>setSelectedMines((current)=>({...current,[reportId]:mineId}))} onAssignMine={(reportId)=>void assignMine(reportId)}/>:null}
  </div>;
}
