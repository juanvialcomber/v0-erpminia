import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeRut(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, '');
}

async function ensureDocumentSlots(supabase: ReturnType<typeof getSupabaseServerClient>, carpetaId: string) {
  const DOCUMENTOS = [
    'Certificado de afiliacion y cotizacion a Organismo Administrador',
    'Certificado de Accidentabilidad (ultimos 2 anos)',
    'Reglamento interno de orden, higiene y seguridad',
    'Copia IRL de todos sus colaboradores',
    'Contratos de trabajos de su personal',
    'Registro de entrega de EPP',
    'Registro interno de la empresa contratista',
    'Recepcion firmada del Sistema de Gestion y Seguridad en el Trabajo',
    'Examenes pre-ocupacionales (ultimos 3 anos)',
    'Examenes ocupacionales (agentes como ruido, silice)',
    'Documentacion de trabajadores extranjeros',
    'Procedimientos de trabajos actualizados con NRCT',
    'Procedimiento en caso de accidente',
    'Politica de empresa contratista en control de riesgos',
    'Copia carnet de identidad de todos los colaboradores',
    'Licencias de conduccion vigentes',
    'Recepcion de conductores por reglamento interno',
    'Programa de supervision a cargo personal',
    'Matriz de Identificacion de Peligros (MIPER)',
  ];

  const { data: existingSlots, error: slotsLookupError } = await supabase
    .from('carpeta_documentos')
    .select('slot_index')
    .eq('carpeta_id', carpetaId);

  if (slotsLookupError) {
    throw slotsLookupError;
  }

  const usedSlots = new Set((existingSlots || []).map((slot) => Number(slot.slot_index)));
  const slots = DOCUMENTOS
    .map((nombre, i) => ({ carpeta_id: carpetaId, slot_index: i + 1, documento_nombre: nombre }))
    .filter((slot) => !usedSlots.has(slot.slot_index));

  if (slots.length === 0) {
    return { inserted: 0, total: DOCUMENTOS.length };
  }

  const { error: insertError } = await supabase.from('carpeta_documentos').insert(slots);
  if (insertError) {
    throw insertError;
  }

  return { inserted: slots.length, total: DOCUMENTOS.length };
}

// GET  /api/carpeta-arranque  — list all carpetas (with doc counts per carpeta)
export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const [legalAccess, hseAccess] = await Promise.all([
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.LEGAL_EECC),
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.HSE_DOCUMENTACION),
  ]);
  if (legalAccess === 'SR' && hseAccess === 'SR') {
    return NextResponse.json({ error: 'Sin acceso a carpetas de contratistas' }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();

  const { data: carpetas, error } = await supabase
    .from('carpetas_arranque')
    .select(`
      id, empresa_nombre, empresa_rut, contacto_email, status,
      revisor_l1_nombre, revisor_l1_status, revisor_l1_fecha,
      revisor_l2_nombre, revisor_l2_status, revisor_l2_fecha,
      submitted_at, created_at, updated_at,
      carpeta_documentos ( id, slot_index, documento_nombre, file_name, file_path, uploaded_at, l1_status, l1_observaciones, l2_status, l2_observaciones )
    `)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ carpetas });
}

// POST /api/carpeta-arranque  — create a new carpeta + pre-seed 19 document slots
export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const [legalAccess, hseAccess] = await Promise.all([
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.LEGAL_EECC),
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.HSE_DOCUMENTACION),
  ]);
  if (legalAccess === 'SR' && hseAccess === 'SR') {
    return NextResponse.json({ error: 'Sin acceso a carpetas de contratistas' }, { status: 403 });
  }

  if (legalAccess !== 'ED' && hseAccess !== 'ED') {
    return NextResponse.json({ error: 'Sin permiso para crear carpetas' }, { status: 403 });
  }

  const body = await request.json();
  const { empresa_nombre, empresa_rut, contacto_email } = body;

  const normalizedNombre = normalizeText(empresa_nombre);
  const normalizedEmail = normalizeEmail(contacto_email);
  const normalizedRut = normalizeRut(empresa_rut);

  if (!normalizedNombre || !normalizedEmail) {
    return NextResponse.json({ error: 'Nombre de empresa y correo son requeridos' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const buildExistingQuery = () =>
    supabase
      .from('carpetas_arranque')
      .select('id, empresa_nombre, empresa_rut, contacto_email, status')
      .order('created_at', { ascending: false })
      .limit(1);

  const { data: existingByRut, error: rutLookupError } = normalizedRut
    ? await buildExistingQuery().eq('empresa_rut', normalizedRut)
    : { data: [], error: null };

  if (rutLookupError) {
    return NextResponse.json({ error: rutLookupError.message }, { status: 500 });
  }

  const { data: existingByName, error: nameLookupError } = !normalizedRut && !(existingByRut || []).length
    ? await buildExistingQuery().eq('empresa_nombre', normalizedNombre).eq('contacto_email', normalizedEmail)
    : { data: [], error: null };

  if (nameLookupError) {
    return NextResponse.json({ error: nameLookupError.message }, { status: 500 });
  }

  const existingCarpeta = ((existingByRut || existingByName || [])[0] || null) as { id: string } | null;
  let carpetaId = existingCarpeta?.id || '';
  let created = false;

  if (!carpetaId) {
    const { data: carpeta, error: carpetaError } = await supabase
      .from('carpetas_arranque')
      .insert({
        empresa_nombre: normalizedNombre,
        empresa_rut: normalizedRut || null,
        contacto_email: normalizedEmail,
        created_by: auth.user.id,
        status: 'pendiente',
      })
      .select('id, empresa_nombre, empresa_rut, contacto_email, status')
      .single();

    if (carpetaError) return NextResponse.json({ error: carpetaError.message }, { status: 500 });
    carpetaId = carpeta.id;
    created = true;
  }

  const slotResult = await ensureDocumentSlots(supabase, carpetaId);

  return NextResponse.json({
    carpeta: existingCarpeta || { id: carpetaId, empresa_nombre: normalizedNombre, empresa_rut: normalizedRut || null, contacto_email: normalizedEmail, status: 'pendiente' },
    created,
    inserted_slots: slotResult.inserted,
    total_slots: slotResult.total,
  }, { status: created ? 201 : 200 });
}
