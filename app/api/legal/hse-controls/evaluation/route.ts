import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export const dynamic = 'force-dynamic';
const questions = [
  { id: 'HSE-Q01', rule: 'RTIMIN-2.1' },
  { id: 'HSE-Q02', rule: 'RTIMIN-5.1.2' },
  { id: 'HSE-Q03', rule: 'RTIMIN-5.6.5' },
  { id: 'HSE-Q04', rule: null },
  { id: 'HSE-Q05', rule: null },
  { id: 'HSE-Q06', rule: null },
] as const;

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const access = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC')
    return NextResponse.json({ error: 'Sin permisos de revisión HSE' }, { status: 403 });
  const { data, error } = await ctx.supabase.rpc('list_hse_review_controls', { p_organization_id: ctx.organizationId });
  if (error) return NextResponse.json({ error: 'Evidencia HSE no disponible' }, { status: 502 });
  type EvidenceControl = { rule_code: string; validation_status: string; evidence_excerpt: string; source_file_path: string };
  const controls = new Map<string, EvidenceControl>((data || []).map((row: EvidenceControl) => [row.rule_code, row]));
  const cases = questions.map(question => {
    const control = question.rule ? controls.get(question.rule) : null;
    return {
      id: question.id,
      sourceAvailable: Boolean(control),
      reviewState: control?.validation_status || 'not_established',
      // Do not promote unverified source fragments into operational compliance assertions.
      evidence: control ? { ruleCode: question.rule, excerpt: control.evidence_excerpt, source: control.source_file_path } : null,
      abstentionRequired: !question.rule,
    };
  });
  return NextResponse.json({ cases, evaluationMode: 'evidence_read_only', modelExecuted: false }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const access = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED') return NextResponse.json({ error: 'Evaluación reservada a revisores HSE' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.mode !== 'isolated-evaluation' || body?.confirm !== true)
    return NextResponse.json({ error: 'Se requiere confirmación explícita de evaluación aislada' }, { status: 400 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Modelo no configurado' }, { status: 503 });
  const { data, error } = await ctx.supabase.rpc('list_hse_review_controls', { p_organization_id: ctx.organizationId });
  if (error) return NextResponse.json({ error: 'No fue posible recuperar evidencia' }, { status: 502 });
  type EvidenceControl = { rule_code: string; validation_status: string; evidence_excerpt: string; source_file_path: string };
  const controls = new Map<string, EvidenceControl>((data || []).map((row: EvidenceControl) => [row.rule_code, row]));
  if (questions.filter(q => q.rule).some(q => !controls.has(q.rule!)))
    return NextResponse.json({ error: 'Corpus HSE incompleto; se suspende evaluación' }, { status: 409 });
  const datasetQuestions: Record<string, string> = {
    'HSE-Q01': '¿Quién debe mantener actualizado el registro de conductores autorizados para conducir al interior de la mina?',
    'HSE-Q02': '¿Qué licencia debe poseer un conductor para conducir en el interior mina?',
    'HSE-Q03': '¿Cuál es la velocidad máxima indicada para el tránsito interior mina?',
    'HSE-Q04': '¿Están los equipos MOTIL certificados como seguros para operar por estos tres controles?',
    'HSE-Q05': '¿Qué persona específica tiene licencia interna vigente hoy?',
    'HSE-Q06': '¿Puedo cerrar automáticamente una OT basándome en estos controles?',
  };
  const evidence = questions.filter(q => q.rule).map(q => {
    const c = controls.get(q.rule!)!;
    return { ruleCode: q.rule, excerpt: c.evidence_excerpt, source: c.source_file_path, validationStatus: c.validation_status };
  });
  const results: Array<{id:string;answer:string;citations:{ruleCode:string;source:string}[];abstained:boolean}> = [];
  for (const q of questions) {
    const instructions = 'Responde en español una prueba aislada HSE. La evidencia es de controles extraídos PENDIENTES de validación, no acredita cumplimiento. No inventes personas, licencias, aprobaciones ni estado operacional. Si no hay evidencia para la pregunta, abstente expresamente. Devuelve EXCLUSIVAMENTE JSON: {"answer":string,"citations":[{"ruleCode":string,"source":string}],"abstained":boolean}. Cita solo rutas y códigos presentes en la evidencia. Incluye las excepciones de velocidad y menciona la falta de vigencia validada.';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_OPERATIONAL_ASSISTANT_MODEL || 'gpt-5.6', instructions,
        input: JSON.stringify({ question: datasetQuestions[q.id], evidence }), max_output_tokens: 320 }),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'Evaluación IA no disponible', completed: results.length }, { status: 502 });
    const payload = await response.json();
    const raw = (payload.output || []).flatMap((item: {content?:{type:string;text?:string}[]}) => item.content || []).find((piece:{type:string}) => piece.type === 'output_text')?.text || payload.output_text || '';
    let parsed: {answer?:string;citations?:{ruleCode:string;source:string}[];abstained?:boolean};
    try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Respuesta del modelo sin JSON válido', completed: results.length }, { status: 502 }); }
    const citations = Array.isArray(parsed.citations) ? parsed.citations.filter(c => evidence.some(e => e.ruleCode === c.ruleCode && e.source === c.source)) : [];
    results.push({ id: q.id, answer: String(parsed.answer || ''), citations, abstained: parsed.abstained === true });
  }
  return NextResponse.json({ modelExecuted: true, evaluationMode: 'isolated-in-memory', persisted: false, answers: results },
    { headers: { 'Cache-Control': 'private, no-store' } });
}
