import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SOURCES = [
  { title: 'SERNAGEOMIN — Seguridad minera', url: 'https://www.sernageomin.cl/seguridad-minera/' },
  { title: 'SERNAGEOMIN — Formularios de seguridad minera', url: 'https://www.sernageomin.cl/formularios-seguridad-minera/' },
  { title: 'SERNAGEOMIN — SIMIN', url: 'https://www.sernageomin.cl/simin/' },
  { title: 'DS 132 — Reglamento de Seguridad Minera', url: 'https://www.sernageomin.cl/gobiernotransparente/marconormativo/pdf/ReglamentodeSeguridadMinera.pdf' },
  { title: 'DS 76 — Subcontratación', url: 'https://www.bcn.cl/leychile/navegar?idNorma=257601' },
  { title: 'Ley 16.744', url: 'https://www.bcn.cl/leychile/navegar?idNorma=28650' },
];

const SKILLS = [
  'Triage de documentos EECC individuales: distinguir cargado, revisado, observado y faltante.',
  'Aplicabilidad normativa: separar requisito aplicable, no aplicable y pendiente de decisión fundamentada.',
  'Análisis documental preliminar: señalar incertidumbres y pedir evidencia; nunca certificar autenticidad ni vigencia no contrastada.',
  'SERNAGEOMIN y DS 132: orientar hacia fuentes oficiales, sin asumir que toda obligación aplica a toda faena.',
  'DS 76 y Ley 16.744: identificar puntos de revisión para coordinación de empresas contratistas.',
  'Redacción de observaciones y solicitud de subsanaciones, para validación y envío manual por Legal.',
  'Separación de responsabilidades: Legal L1, firma L2 opcional, HSE y habilitación operacional son decisiones distintas.',
];

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_EECC);
  if (!access.authorized) return access.response;
  if (!access.organizationId) return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  const db = getSupabaseServerClient();
  const rutKey = (value: unknown) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const { data: companies, error: companyError } = await db.from('eecc').select('rut').eq('organization_id', access.organizationId).eq('is_active', true).limit(250);
  if (companyError) return NextResponse.json({ error: 'No se pudo cargar EECC' }, { status: 503 });
  const permitted = new Set((companies || []).map(c => rutKey(c.rut)).filter(Boolean));
  const { data: folders, error: folderError } = await db.from('carpetas_arranque')
    .select('id,empresa_nombre,empresa_rut,status,carpeta_documentos(slot_index,documento_nombre,file_name,l1_status)')
    .order('created_at', { ascending: false }).limit(500);
  if (folderError) return NextResponse.json({ error: 'No se pudo cargar documentos' }, { status: 503 });
  const queue = (folders || []).filter(f => permitted.has(rutKey(f.empresa_rut)) && ['pendiente','en_revision_l1'].includes(f.status))
    .flatMap(f => (f.carpeta_documentos || []).filter(d => d.file_name && !d.l1_status)
      .map(d => ({ folder_id: f.id, company: f.empresa_nombre, slot: d.slot_index, document: d.documento_nombre }))).slice(0,100);
  return NextResponse.json({ skills: SKILLS, sources: SOURCES, review_queue: queue });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_EECC);
  if (!access.authorized) return access.response;
  if (!access.organizationId) return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 1800) return NextResponse.json({ error: 'Consulta requerida (máximo 1800 caracteres)' }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Asistente IA no configurado: falta OPENAI_API_KEY' }, { status: 503 });
  const db = getSupabaseServerClient();
  const { data: companies, error: eeccError } = await db.from('eecc').select('id,name,rut').eq('organization_id', access.organizationId).eq('is_active', true).limit(100);
  if (eeccError) return NextResponse.json({ error: 'No se pudo consultar contratistas' }, { status: 503 });
  const rutKey = (value: unknown) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const companiesByRut = new Map((companies || []).filter(c => rutKey(c.rut)).map(c => [rutKey(c.rut), c]));
  const { data: folders, error: folderError } = await db.from('carpetas_arranque')
    .select('id,empresa_nombre,empresa_rut,status,submitted_at,carpeta_documentos(slot_index,documento_nombre,file_name,l1_status,l2_status)')
    .order('created_at', { ascending: false }).limit(100);
  if (folderError) return NextResponse.json({ error: 'No se pudo consultar documentación' }, { status: 503 });
  // Only contractor folders matching this organization's EECC registry are exposed to the model.
  const scoped = (folders || []).filter(f => companiesByRut.has(rutKey(f.empresa_rut)));
  const queue = scoped.filter(f => ['pendiente','en_revision_l1'].includes(f.status)).flatMap(f => (f.carpeta_documentos || []).filter(d => d.file_name && !d.l1_status).map(d => ({
    folder_id: f.id, company: f.empresa_nombre, slot: d.slot_index, document: d.documento_nombre,
    action: 'Revisar documento', status: 'pendiente_l1',
  }))).slice(0, 30);
  const evidence = scoped.map(f => ({
    company: f.empresa_nombre, folder_status: f.status, submitted: Boolean(f.submitted_at),
    documents: (f.carpeta_documentos || []).map(d => ({
      slot: d.slot_index, name: d.documento_nombre, uploaded: Boolean(d.file_name),
      l1: d.l1_status || 'sin_revisar', l2: d.l2_status || 'sin_revisar',
    })),
  }));
  const system = [
    'Eres copiloto técnico-jurídico de Legal de MOTIL para Elías Fernández, no un aprobador autónomo.',
    'Responde en español claro, concreto y breve. Distingue HECHO del sistema, NORMA referencial y PENDIENTE DE VALIDAR.',
    'No inventes obligaciones, artículos, fechas, plazos, cumplimiento, contratos ni documentos; si falta evidencia di qué falta.',
    'Los archivos cargados NO están verificados por ti: recibes metadatos, nunca contenido documental. No afirmes haber leído un PDF.',
    'Elías puede revisar L1 por documento; la carpeta solo se cierra después del envío, aplicabilidad y controles correspondientes.',
    'La firma L2 puede ser opcional pero HSE y autorización operacional nunca se sustituyen por aprobación Legal.',
    'No apruebes, rechaces, envíes notificaciones, ni afirmes que realizaste acciones: tus propuestas requieren confirmación humana.',
    'No trates una lista base de 19 documentos como 19 obligaciones universales.',
    'Para normativa enlaza solo las fuentes suministradas; son enlaces de consulta, no textos consolidados verificados en tiempo real.',
    'Cuando cites una norma, da URL y advierte verificar vigencia y aplicabilidad para la faena.',
    'Cuando corresponda, termina con una sección SIGUIENTE ACCIÓN indicando el documento y la acción que Elías puede ejecutar, sin afirmar que ya se realizó.',
    'Documentos disponibles para acción L1: ' + JSON.stringify(queue),
    'Habilidades:\n' + SKILLS.join('\n'),
    'Fuentes oficiales de consulta:\n' + SOURCES.map(x => x.title + ': ' + x.url).join('\n'),
    'Datos estructurados del sistema para esta organización (no contienen documentos originales):\n' + JSON.stringify(evidence),
  ].join('\n\n');
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_LEGAL_MODEL || 'gpt-4o-mini', temperature: 0.2, max_tokens: 900,
        messages: [{ role: 'system', content: system }, { role: 'user', content: question }] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return NextResponse.json({ error: 'El proveedor IA no está disponible' }, { status: 502 });
    const result = await response.json();
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) return NextResponse.json({ error: 'Respuesta IA vacía' }, { status: 502 });
    return NextResponse.json({ answer, sources: SOURCES, review_queue: queue, evidence_folders: scoped.length, disclaimer: 'Orientación preliminar. Validación de Legal y Prevención requerida.' });
  } catch {
    return NextResponse.json({ error: 'La consulta no pudo completarse' }, { status: 504 });
  }
}
