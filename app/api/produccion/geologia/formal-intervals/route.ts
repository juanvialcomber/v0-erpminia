export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT = 2000;
const intervalFields = ['lithology','alteration','mineralization','structures','field_notes'] as const;
const transitions: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['draft','validated','rejected'],
  rejected: [],
  validated: [],
};

function sourceText(value: unknown, limit = 500) {
  return typeof value === 'string' ? value.trim().slice(0,limit) : '';
}
function optionalText(value: unknown) {
  const text = sourceText(value,MAX_TEXT);
  return text || null;
}
function finiteNumber(value: unknown) {
  if (value === '' || value == null || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function optionalPct(value: unknown) {
  const number = finiteNumber(value);
  if (value != null && value !== '' && (number == null || number < 0 || number > 100)) return { ok:false as const };
  return { ok:true as const, value:number };
}
function unavailable(error: any) {
  return error?.code === '42P01'
    ? NextResponse.json({ error:'El registro geológico formal aún no está habilitado. Se conserva el expediente operacional sin cambios.', available:false }, { status:503 })
    : NextResponse.json({ error:error?.message || 'No fue posible consultar el registro geológico' }, { status:500 });
}
async function scopedContext(request: NextRequest, requireWrite = false) {
  const access = await requireModuleAccess(request, MODULE_KEYS.PROD_GEOLOGIA, requireWrite);
  if (!access.authorized) return { ok:false as const, response:access.response };
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok:false as const, response:context.response };
  return { ok:true as const, access, context };
}
function validDate(value: unknown) {
  const date = sourceText(value,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date+'T00:00:00Z');
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === date;
}

export async function GET(request: NextRequest) {
  const scoped = await scopedContext(request);
  if (!scoped.ok) return scoped.response;
  const { context, access } = scoped;
  const holeId = request.nextUrl.searchParams.get('holeId') || '';
  const intervalId = request.nextUrl.searchParams.get('intervalId') || '';
  if (!UUID.test(holeId) || (intervalId && !UUID.test(intervalId))) {
    return NextResponse.json({ error:'Identificador inválido' }, { status:400 });
  }

  const hole = await context.supabase.from('production_drill_holes').select('id,hole_code,drilled_depth_m')
    .eq('organization_id',context.organizationId).eq('id',holeId).maybeSingle();
  if (hole.error) return unavailable(hole.error);
  if (!hole.data) return NextResponse.json({ error:'Sondaje no encontrado' }, { status:404 });

  let query = context.supabase.from('production_geology_formal_intervals')
    .select('id,drill_hole_id,from_m,to_m,observed_on,source_reference,lithology,alteration,mineralization,structures,recovery_pct,rqd_pct,field_notes,status,created_by,last_actor_id,reviewed_by,reviewed_at,reviewer_comment,created_at,updated_at')
    .eq('organization_id',context.organizationId).eq('drill_hole_id',holeId);
  if (intervalId) query = query.eq('id',intervalId);
  const records = await query.order('from_m',{ascending:true}).limit(100);
  if (records.error) return unavailable(records.error);

  const events = intervalId && records.data?.length
    ? await context.supabase.from('production_geology_formal_interval_events')
        .select('id,interval_id,actor_id,event_type,previous_status,next_status,created_at')
        .eq('organization_id',context.organizationId).eq('interval_id',intervalId)
        .order('created_at',{ascending:false}).limit(60)
    : {data:[],error:null};
  if (events.error) return unavailable(events.error);
  return NextResponse.json({ available:true, canWrite:access.canWrite, viewerId:context.userId, hole:hole.data, rows:records.data || [], events:events.data || [],
    notes:'El registro geológico formal es distinto de los intervalos operacionales y de los ensayes de laboratorio.' },
    {headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(request: NextRequest) {
  const scoped = await scopedContext(request,true);
  if (!scoped.ok) return scoped.response;
  const { context } = scoped;
  const body = await request.json().catch(()=>null);
  const holeId = sourceText(body?.holeId,50);
  const fromM = finiteNumber(body?.fromM);
  const toM = finiteNumber(body?.toM);
  const recovery = optionalPct(body?.recoveryPct);
  const rqd = optionalPct(body?.rqdPct);
  const sourceReference = sourceText(body?.sourceReference);
  const observedOn = body?.observedOn;
  if (!UUID.test(holeId) || fromM == null || toM == null || fromM < 0 || toM <= fromM ||
      !recovery.ok || !rqd.ok || !validDate(observedOn) || sourceReference.length < 3) {
    return NextResponse.json({ error:'Revisa sondaje, profundidad, fecha, referencia fuente y porcentajes entre 0 y 100.' }, { status:400 });
  }

  const hole = await context.supabase.from('production_drill_holes')
    .select('id,drilled_depth_m').eq('organization_id',context.organizationId).eq('id',holeId).maybeSingle();
  if (hole.error) return unavailable(hole.error);
  if (!hole.data) return NextResponse.json({error:'Sondaje no encontrado'}, {status:404});
  if (hole.data.drilled_depth_m != null && toM > Number(hole.data.drilled_depth_m)) {
    return NextResponse.json({error:'El intervalo excede la profundidad perforada canónica; revisa la fuente antes de guardar.'},{status:400});
  }

  const fields:Record<string,unknown> = {};
  for (const key of intervalFields) fields[key]=optionalText(body?.[key]);
  if (!Object.values(fields).some(Boolean)) {
    return NextResponse.json({error:'Registra al menos una observación geológica explícita.'},{status:400});
  }
  const insert = await context.supabase.from('production_geology_formal_intervals').insert({
    organization_id:context.organizationId,drill_hole_id:holeId,
    from_m:fromM,to_m:toM,observed_on:observedOn,source_reference:sourceReference,
    recovery_pct:recovery.value,rqd_pct:rqd.value,...fields,
    status:'draft',created_by:context.userId,last_actor_id:context.userId,
  }).select('id,status').single();
  if (insert.error?.code === '23505') return NextResponse.json({error:'Ya existe un registro con el mismo tramo y referencia fuente.'},{status:409});
  if (insert.error) return unavailable(insert.error);
  return NextResponse.json({row:insert.data},{status:201});
}

export async function PATCH(request: NextRequest) {
  const scoped = await scopedContext(request,true);
  if (!scoped.ok) return scoped.response;
  const { context }=scoped;
  const body=await request.json().catch(()=>null);
  const intervalId=sourceText(body?.intervalId,50);
  const holeId=sourceText(body?.holeId,50);
  if (!UUID.test(intervalId) || !UUID.test(holeId)) return NextResponse.json({error:'Identificador inválido'},{status:400});
  const current=await context.supabase.from('production_geology_formal_intervals')
    .select('*').eq('organization_id',context.organizationId).eq('drill_hole_id',holeId).eq('id',intervalId).maybeSingle();
  if (current.error) return unavailable(current.error);
  if (!current.data) return NextResponse.json({error:'Registro no encontrado'},{status:404});
  const row=current.data;
  const nextStatus=sourceText(body?.status,30)||row.status;
  if (nextStatus === row.status && row.status !== 'draft') {
    return NextResponse.json({error:'Sólo los borradores admiten edición; utiliza una transición de revisión.'},{status:409});
  }
  if (nextStatus !== row.status && !transitions[String(row.status)]?.includes(nextStatus)) {
    return NextResponse.json({error:'Transición de estado no permitida'},{status:409});
  }

  let patch:Record<string,unknown>={last_actor_id:context.userId};
  if (nextStatus !== row.status) {
    // Submitted records can only return to draft or receive an independent decision.
    if (nextStatus === 'submitted' && !sourceText(row.source_reference)) {
      return NextResponse.json({error:'No se puede enviar un intervalo sin evidencia fuente.'},{status:400});
    }
    if (['validated','rejected'].includes(nextStatus)) {
      const comment=sourceText(body?.reviewerComment,2000);
      if (context.userId === row.created_by) return NextResponse.json({error:'Quien creó el intervalo no puede aprobarlo o rechazarlo.'},{status:403});
      if (comment.length < 10) return NextResponse.json({error:'La revisión requiere comentario de al menos 10 caracteres.'},{status:400});
      patch={...patch,reviewed_by:context.userId,reviewed_at:new Date().toISOString(),reviewer_comment:comment};
    }
    patch.status=nextStatus;
  } else if (row.status === 'draft') {
    for (const key of intervalFields) if (Object.prototype.hasOwnProperty.call(body,key)) patch[key]=optionalText(body[key]);
    if (body?.recoveryPct !== undefined) {
      const value=optionalPct(body.recoveryPct);
      if (!value.ok) return NextResponse.json({error:'Recuperación fuera de rango.'},{status:400});
      patch.recovery_pct=value.value;
    }
    if (body?.rqdPct !== undefined) {
      const value=optionalPct(body.rqdPct);
      if (!value.ok) return NextResponse.json({error:'RQD fuera de rango.'},{status:400});
      patch.rqd_pct=value.value;
    }
  }
  const updated=await context.supabase.from('production_geology_formal_intervals')
    .update(patch).eq('organization_id',context.organizationId).eq('drill_hole_id',holeId)
    .eq('id',intervalId).eq('status',row.status).select('id,status,updated_at,reviewed_at').maybeSingle();
  if (updated.error) return unavailable(updated.error);
  if (!updated.data) return NextResponse.json({error:'El registro cambió desde tu última consulta. Actualiza la pantalla.'},{status:409});
  return NextResponse.json({row:updated.data});
}
