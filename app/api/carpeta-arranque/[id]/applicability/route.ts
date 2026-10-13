import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_EECC);
  if (!access.authorized) return access.response;
  const { id } = await params;
  const db = getSupabaseServerClient();
  const { data: folder, error: folderError } = await db.from('carpetas_arranque').select('id').eq('id',id).maybeSingle();
  if (folderError || !folder) return NextResponse.json({ error: 'Carpeta no encontrada' },{status:404});
  const {data,error} = await db.from('eecc_document_applicability').select('slot_index,applicability,rationale,legal_basis,evidence_reference,decided_by,decided_at').eq('carpeta_id',id).order('slot_index');
  if (error) return NextResponse.json({error:'No se pudo consultar aplicabilidad normativa'},{status:503});
  return NextResponse.json({decisions:data, pending:19-(data||[]).filter(d=>d.applicability!=='pendiente').length, scope:'documental_no_habilita_ingreso'});
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_EECC,true);
  if (!access.authorized) return access.response;
  const { id } = await params;
  const body = await request.json().catch(()=>null);
  const index = Number(body?.slot_index);
  const applicability = body?.applicability;
  const rationale = String(body?.rationale ?? '').trim();
  const basis = String(body?.legal_basis ?? '').trim();
  const evidence = String(body?.evidence_reference ?? '').trim();
  if (!Number.isInteger(index)||index<1||index>19||!['aplica','no_aplica','pendiente'].includes(applicability))
    return NextResponse.json({error:'Documento o decisión inválidos'},{status:400});
  if (applicability !== 'pendiente' && (rationale.length<8 || (applicability === 'no_aplica' && basis.length<5)))
    return NextResponse.json({error:'La decisión requiere fundamento; no aplica exige referencia normativa o criterio interno'},{status:400});
  const db = getSupabaseServerClient();
  const {data:folder,error:folderError}=await db.from('carpetas_arranque').select('id,status').eq('id',id).maybeSingle();
  if(folderError||!folder) return NextResponse.json({error:'Carpeta no encontrada'},{status:404});
  if(folder.status==='aprobado') return NextResponse.json({error:'Carpeta aprobada; reabrir mediante proceso controlado'},{status:409});
  const {data:slot,error:slotError}=await db.from('carpeta_documentos').select('id').eq('carpeta_id',id).eq('slot_index',index).maybeSingle();
  if(slotError||!slot) return NextResponse.json({error:'Documento inexistente'},{status:404});
  const now=new Date().toISOString();
  const {data,error}=await db.from('eecc_document_applicability').upsert({
    carpeta_id:id,slot_index:index,applicability,rationale:applicability==='pendiente'?null:rationale,
    legal_basis:basis||null,evidence_reference:evidence||null,
    decided_by:applicability==='pendiente'?null:access.user.id,
    decided_at:applicability==='pendiente'?null:now,updated_at:now,
  },{onConflict:'carpeta_id,slot_index'}).select('slot_index,applicability,rationale,legal_basis,decided_at').single();
  if(error) return NextResponse.json({error:'No se pudo registrar la decisión'},{status:503});
  return NextResponse.json({decision:data});
}
