import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// POST /api/carpeta-arranque/[id]/review
// Body: { level: 1 | 2, reviews: [{ slot_index, status: 'cumple'|'no_cumple', observaciones }] }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const legalAccess = await getModuleAccessLevel(auth.user.id,auth.role,MODULE_KEYS.LEGAL_EECC);
  const hseAccess = await getModuleAccessLevel(auth.user.id,auth.role,MODULE_KEYS.HSE_DOCUMENTACION);
  if (legalAccess !== 'ED' && hseAccess !== 'ED') return NextResponse.json({error:'Sin permiso de revisión'}, {status:403});

  const { id: carpetaId } = await params;
  const body = await request.json();
  const { level, reviews, requireSecondReview } = body as {
    level: 1 | 2;
    requireSecondReview?: boolean;
    reviews: Array<{ slot_index: number; status: 'cumple' | 'no_cumple'; observaciones: string }>;
  };

  if (![1,2].includes(level) || !Array.isArray(reviews) || !reviews.length || (level === 1 && typeof requireSecondReview !== 'boolean')) {
    return NextResponse.json({ error: 'Faltan parametros: level y reviews' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: carpeta, error: carpetaError } = await supabase
    .from('carpetas_arranque')
    .select('*, carpeta_documentos(*)')
    .eq('id', carpetaId)
    .single();

  if (carpetaError || !carpeta) {
    return NextResponse.json({ error: 'Carpeta no encontrada' }, { status: 404 });
  }

  // Legal owns the first decision. Second approval must be independent.
  if (level === 1 && legalAccess !== 'ED') {
    return NextResponse.json({error:'La primera revisión corresponde a Legal'}, {status:403});
  }
  if (level === 2 && carpeta.revisor_l1_id === auth.user.id) {
    return NextResponse.json({error:'La segunda firma requiere otro revisor'}, {status:403});
  }

  // Enforce review sequencing: L2 only after L1 approved
  if (level === 2 && carpeta.status !== 'en_revision_l2') {
    return NextResponse.json(
      { error: 'La revision Nivel 2 solo puede realizarse despues de que el Nivel 1 apruebe todos los documentos' },
      { status: 409 }
    );
  }
  if (level === 1 && !['en_revision_l1', 'pendiente'].includes(carpeta.status)) {
    return NextResponse.json(
      { error: 'La carpeta no esta en estado de revision Nivel 1' },
      { status: 409 }
    );
  }

  // Validate the full projected state BEFORE writing any review decisions.
  const slots = carpeta.carpeta_documentos as Array<{
    slot_index: number; file_name: string | null; l1_status: string | null; l2_status: string | null;
  }>;
  const validSlots = new Map(slots.map(d => [d.slot_index, d]));
  if (new Set(reviews.map(r => r.slot_index)).size !== reviews.length ||
      reviews.some(r => !Number.isInteger(r.slot_index) || !validSlots.has(r.slot_index) ||
        !validSlots.get(r.slot_index)?.file_name ||
        !['cumple', 'no_cumple'].includes(r.status) ||
        (r.status === 'no_cumple' && !String(r.observaciones || '').trim()))) {
    return NextResponse.json({ error: 'Revisión inválida: documento no cargado, repetido o sin observación' }, {status:400});
  }
  const prefix = level === 1 ? 'l1' : 'l2';
  const proposed = new Map(reviews.map(r => [r.slot_index, r.status]));
  const uploadedDocs = slots.filter(d => !!d.file_name);
  const projected = (d: typeof slots[number], n:1|2) =>
    n === level && proposed.has(d.slot_index) ? proposed.get(d.slot_index) :
      n === 1 ? d.l1_status : d.l2_status;
  const anyL1NoCumple = uploadedDocs.some(d => projected(d, 1) === 'no_cumple');
  const allL1Done = uploadedDocs.length > 0 && uploadedDocs.every(d => projected(d, 1) !== null);
  const anyL2NoCumple = uploadedDocs.some(d => projected(d, 2) === 'no_cumple');
  const allL2Done = uploadedDocs.length > 0 && uploadedDocs.every(d => projected(d, 2) !== null);

  if (level === 1 && carpeta.status === 'en_revision_l1' && allL1Done && !anyL1NoCumple) {
    const { data: decisions, error: scopeError } = await supabase
      .from('eecc_document_applicability')
      .select('slot_index,applicability')
      .eq('carpeta_id',carpetaId);
    if (scopeError) return NextResponse.json({error:'Aplicabilidad normativa no disponible'},{status:503});
    const decided = new Map((decisions || []).map(d=>[d.slot_index,d.applicability]));
    const pending = slots.filter(d=> !['aplica','no_aplica'].includes(decided.get(d.slot_index)||''));
    if (pending.length) return NextResponse.json({error:'Legal debe resolver aplicabilidad antes de aprobar',pending_slots:pending.map(d=>d.slot_index)},{status:409});
    const missing = slots.filter(d=>decided.get(d.slot_index)==='aplica'&&!d.file_name);
    if (missing.length) return NextResponse.json({error:'Faltan documentos aplicables',missing_slots:missing.map(d=>d.slot_index)},{status:409});
  }

  // Early document-level reviews never move a folder awaiting formal submission.
  const now = new Date().toISOString();
  // Every document write is checked; never advance the folder after a failed update.
  for (const r of reviews) {
    const {error: docError} = await supabase.from('carpeta_documentos')
      .update({
        [`${prefix}_status`]: r.status,
        [`${prefix}_observaciones`]: r.observaciones ?? null,
        [`${prefix}_reviewed_by`]: auth.user.id,
        [`${prefix}_reviewed_at`]: now,
        updated_at: now,
      })
      .eq('carpeta_id', carpetaId)
      .eq('slot_index', r.slot_index);
    if (docError) return NextResponse.json({error:'No fue posible guardar todas las revisiones; vuelve a consultar antes de continuar'},{status:503});
  }

  let newCarpetaStatus = carpeta.status;
  const revisorNombre = auth.user.full_name || auth.user.email || 'Revisor';

  if (level === 1) {
    const update: Record<string, unknown> = {
      revisor_l1_id: auth.user.id,
      revisor_l1_nombre: revisorNombre,
      revisor_l1_fecha: now,
    };
    if (carpeta.status === 'en_revision_l1' && allL1Done) {
      newCarpetaStatus = anyL1NoCumple ? 'rechazado' : requireSecondReview ? 'en_revision_l2' : 'aprobado';
      update.revisor_l1_status = anyL1NoCumple ? 'no_cumple' : 'cumple';
      update.status = newCarpetaStatus;
    }
    await supabase.from('carpetas_arranque').update(update).eq('id', carpetaId);
  } else {
    const update: Record<string, unknown> = {
      revisor_l2_id: auth.user.id,
      revisor_l2_nombre: revisorNombre,
      revisor_l2_fecha: now,
    };
    if (allL2Done) {
      newCarpetaStatus = anyL2NoCumple ? 'rechazado' : 'aprobado';
      update.revisor_l2_status = anyL2NoCumple ? 'no_cumple' : 'cumple';
      update.status = newCarpetaStatus;
    }
    await supabase.from('carpetas_arranque').update(update).eq('id', carpetaId);
  }

  // If any doc rejected, notify the EECC contact
  const rejectedReviews = reviews.filter(r => r.status === 'no_cumple');
  if (rejectedReviews.length > 0) {
    const observacionesList = rejectedReviews
      .map(r => `- Documento ${r.slot_index}: ${r.observaciones}`)
      .join('\n');

    const emailBody = `
Estimado/a,

Se ha completado la revision de su Carpeta de Arranque para la empresa "${carpeta.empresa_nombre}".

Los siguientes documentos requieren correccion:

${observacionesList}

Por favor ingresa al sistema y sube las versiones corregidas.

Revisor: ${revisorNombre} (Nivel ${level})
    `.trim();

    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/sostenibilidad/notifications/email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: carpeta.contacto_email,
          subject: `Documentos rechazados en Carpeta de Arranque - ${carpeta.empresa_nombre}`,
          body: emailBody,
          type: 'carpeta_arranque_rejected',
        }),
      }
    ).catch(() => {});
  }

  return NextResponse.json({
    message: 'Revision guardada exitosamente',
    carpeta_status: newCarpetaStatus,
    rejected_count: rejectedReviews.length,
  });
}
